import Foundation
import Observation

/// Mirrors server/queue/store.go QueueItem.
struct QueueItem: Codable, Equatable, Identifiable {
    let id: String
    var title: String
    var notes: String
    var deadline: Date?
    var priority: Int
    var estimateMinutes: Int?
    var position: Int
    var urgencyScore: Double
    var promotedItemId: String?
    var completedAt: Date?
    var createdAt: Date

    /// Entries untouched for 24h drop into the "Yesterday" section (web STALE_MS).
    static let staleAfter: TimeInterval = 24 * 60 * 60

    var isStale: Bool { Date.now.timeIntervalSince(createdAt) > Self.staleAfter }

    /// Share of the 24h window used, 0–1 (drives the age bar).
    var ageFraction: Double { min(Date.now.timeIntervalSince(createdAt) / Self.staleAfter, 1) }

    /// The deadline is a calendar day, stored as midnight UTC of that date (like the web).
    /// Read it back as that same date in the user's own timezone.
    var dueDay: Date? {
        guard let deadline else { return nil }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        return Calendar.current.date(from: utc.dateComponents([.year, .month, .day], from: deadline))
    }

    /// Calendar days from today to the due day (negative once it's passed).
    var daysUntilDue: Int? {
        guard let dueDay else { return nil }
        return Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: .now), to: dueDay).day
    }

    /// Missed once the whole due day has passed locally, so "due today" isn't flagged yet.
    var isOverdue: Bool { (daysUntilDue ?? 0) < 0 }

    /// Web formatDeadline: "overdue" / "due today" / "due tomorrow" / "due in Nd".
    var deadlineText: String? {
        guard let days = daysUntilDue else { return nil }
        switch days {
        case ..<0: return "overdue"
        case 0: return "due today"
        case 1: return "due tomorrow"
        default: return "due in \(days)d"
        }
    }
}

/// Queue data + actions. Port of ui/src/context/QueueContext.tsx.
@MainActor
@Observable
final class QueueStore {
    enum Sort: String, CaseIterable, Identifiable {
        case auto, priority, deadline, shortest, custom
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
    }

    private(set) var items: [QueueItem] = []
    private(set) var history: [QueueItem] = []
    private(set) var hasLoaded = false
    /// Server feature flag (`/api/flags` → queue). The tab is hidden when it's off, like the web.
    private(set) var isEnabled = true
    var errorMessage: String?

    private let api: APIClient
    private var localEdits = 0

    init(api: APIClient) {
        self.api = api
    }

    // MARK: Derived

    var active: [QueueItem] { items.filter { !$0.isStale } }
    var stale: [QueueItem] { items.filter(\.isStale) }
    /// Everything on the belt (including the Yesterday section) whose deadline day has passed.
    var overdueCount: Int { items.filter(\.isOverdue).count }
    /// Web header: "N urgent" for urgency score > 9.
    var urgentCount: Int { active.filter { $0.urgencyScore > 9 }.count }

    func sorted(_ list: [QueueItem], by sort: Sort) -> [QueueItem] {
        switch sort {
        case .auto:
            return list.sorted { $0.urgencyScore > $1.urgencyScore }
        case .priority:
            return list.sorted { $0.priority != $1.priority ? $0.priority < $1.priority : $0.urgencyScore > $1.urgencyScore }
        case .deadline:
            return list.sorted { a, b in
                switch (a.deadline, b.deadline) {
                case let (x?, y?): return x < y
                case (_?, nil): return true
                default: return false
                }
            }
        case .shortest:
            return list.sorted { a, b in
                switch (a.estimateMinutes, b.estimateMinutes) {
                case let (x?, y?): return x < y
                case (_?, nil): return true
                default: return false
                }
            }
        case .custom:
            return list.sorted { $0.position < $1.position }
        }
    }

    // MARK: Loading

    func load() async {
        defer { hasLoaded = true }
        if let flags: [String: Bool] = try? await api.get("/api/flags") {
            isEnabled = flags["queue"] ?? false
        }
        guard isEnabled else { return }
        let editsAtStart = localEdits
        do {
            let list: ItemsResponse = try await api.get("/api/queue")
            // Don't let a fetch that started before a local change undo it.
            if localEdits == editsAtStart { items = list.items ?? [] }
            errorMessage = nil
        } catch {
            if !hasLoaded { errorMessage = error.localizedDescription }
        }
    }

    func loadHistory() async {
        if let list: ItemsResponse = try? await api.get("/api/queue/history") {
            history = list.items ?? []
        }
    }

    // MARK: Actions (ports of QueueContext)

    struct Draft: Encodable, Equatable {
        var title: String
        var notes: String = ""
        /// "YYYY-MM-DDT00:00:00Z" like the web, or nil for no deadline.
        var deadline: String?
        var priority: Int
        var estimateMinutes: Int?

        // The server replaces every field on update, so send explicit nulls.
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(title, forKey: .title)
            try c.encode(notes, forKey: .notes)
            try c.encode(deadline, forKey: .deadline)
            try c.encode(priority, forKey: .priority)
            try c.encode(estimateMinutes, forKey: .estimateMinutes)
        }

        private enum CodingKeys: String, CodingKey {
            case title, notes, deadline, priority, estimateMinutes = "estimate_minutes"
        }
    }

    func create(_ draft: Draft) async throws {
        let item: QueueItem = try await api.post("/api/queue", body: draft)
        localEdits += 1
        items.append(item)
    }

    func update(_ id: String, _ draft: Draft) async throws {
        let item: QueueItem = try await api.send("PATCH", "/api/queue/\(id)", body: draft)
        localEdits += 1
        if let i = items.firstIndex(where: { $0.id == id }) { items[i] = item }
    }

    /// ✓ — leaves the belt and shows up in Done history.
    func complete(_ id: String) async {
        await optimisticRemove(id) {
            let _: QueueItem = try await self.api.post("/api/queue/\(id)/complete", body: APIClient.Empty())
        }
    }

    /// × — dismiss (server soft-delete).
    func archive(_ id: String) async {
        await optimisticRemove(id) {
            let _: APIClient.Empty = try await self.api.send("DELETE", "/api/queue/\(id)", body: Optional<APIClient.Empty>.none)
        }
    }

    /// Back onto the belt with a fresh 24h window.
    func revive(_ id: String) async {
        do {
            let item: QueueItem = try await api.post("/api/queue/\(id)/revive", body: APIClient.Empty())
            localEdits += 1
            if let i = items.firstIndex(where: { $0.id == id }) { items[i] = item }
        } catch {
            errorMessage = "Couldn't revive: \(error.localizedDescription)"
        }
    }

    struct PromoteResult: Decodable {
        let itemId: String
        let itemDisplayId: String
    }

    /// Convert ↗ — becomes a board item in the board's first status, keeping priority and estimate.
    func promote(_ id: String, projectID: String, statusID: String, epicID: String?) async throws -> PromoteResult {
        struct Body: Encodable { let projectId: String; let statusId: String; let epicId: String? }
        let result: PromoteResult = try await api.post("/api/queue/\(id)/promote",
                                                       body: Body(projectId: projectID, statusId: statusID, epicId: epicID))
        localEdits += 1
        items.removeAll { $0.id == id }
        return result
    }

    /// Drag-to-reorder: switches the belt to Custom order and saves positions.
    func reorder(_ orderedIDs: [String]) async {
        localEdits += 1
        for (index, id) in orderedIDs.enumerated() {
            if let i = items.firstIndex(where: { $0.id == id }) { items[i].position = index }
        }
        struct Body: Encodable { let order: [String] }
        do {
            let _: APIClient.Empty = try await api.send("PUT", "/api/queue/reorder", body: Body(order: orderedIDs))
        } catch {
            errorMessage = "Couldn't save order: \(error.localizedDescription)"
            await load()
        }
    }

    private func optimisticRemove(_ id: String, _ call: @escaping () async throws -> Void) async {
        guard let i = items.firstIndex(where: { $0.id == id }) else { return }
        let removed = items.remove(at: i)
        localEdits += 1
        do {
            try await call()
        } catch {
            items.insert(removed, at: min(i, items.count))
            errorMessage = "Couldn't update \"\(removed.title)\": \(error.localizedDescription)"
        }
    }

    private struct ItemsResponse: Decodable { let items: [QueueItem]? }
}
