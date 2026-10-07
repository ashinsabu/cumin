import Foundation
import Observation

/// Board data + actions. Port of the board parts of ui/src/context/BoardContext.tsx.
@MainActor
@Observable
final class BoardStore {
    private(set) var board: Board?
    private(set) var statuses: [Status] = []
    private(set) var items: [Item] = []
    private(set) var epics: [Epic] = []
    private(set) var projects: [Project] = []
    /// Most recently deleted item, kept briefly so it can be restored (web: undo toast).
    private(set) var recentlyDeleted: Item?
    private(set) var activeSprint: Sprint?
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    var errorMessage: String?

    private let api: APIClient
    /// Bumped on every local change, so a background refresh that started earlier can't undo it.
    private var localEdits = 0
    private var isRefreshing = false

    init(api: APIClient) {
        self.api = api
    }

    func items(in status: Status) -> [Item] {
        items.filter { $0.statusId == status.id }.sorted { $0.position < $1.position }
    }

    var plannedMinutes: Int {
        items.reduce(0) { $0 + ($1.estimateMinutes ?? 0) }
    }

    /// Initial load and pull-to-refresh: shows errors.
    func load() async {
        isLoading = true
        defer { isLoading = false; hasLoaded = true }
        do {
            apply(try await fetch())
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Background sync (app foregrounded / periodic poll). Silent on failure, e.g. when offline.
    func refresh() async {
        guard hasLoaded, !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }

        let editsAtStart = localEdits
        guard let snapshot = try? await fetch() else { return }
        // A move happened while we were fetching: this snapshot may predate it, so skip it.
        guard localEdits == editsAtStart else { return }
        apply(snapshot)
    }

    private struct Snapshot {
        let board: Board
        let statuses: [Status]
        let items: [Item]
        let epics: [Epic]
        let projects: [Project]
        let sprint: Sprint?
    }

    private func fetch() async throws -> Snapshot {
        async let board: Board = api.get("/api/board")
        async let statuses: StatusList = api.get("/api/board/statuses")
        async let items: ItemList = api.get("/api/items")
        async let epics: EpicList = api.get("/api/epics")
        async let projects: ProjectList = api.get("/api/projects")
        async let sprint = activeSprintOrNil()
        return try await Snapshot(
            board: board,
            statuses: (statuses.statuses ?? []).sorted { $0.position < $1.position },
            items: items.items ?? [],
            epics: epics.epics ?? [],
            projects: projects.projects ?? [],
            sprint: sprint
        )
    }

    private func apply(_ s: Snapshot) {
        // Assign only what changed, so SwiftUI doesn't redraw the board every poll.
        if board != s.board { board = s.board }
        if statuses != s.statuses { statuses = s.statuses }
        if items != s.items { items = s.items }
        if epics != s.epics { epics = s.epics }
        if projects != s.projects { projects = s.projects }
        if activeSprint != s.sprint { activeSprint = s.sprint }
    }

    /// Optimistic move, like the web: update locally first, roll back if the server refuses.
    func move(itemID: String, to statusID: String) async {
        guard let idx = items.firstIndex(where: { $0.id == itemID }),
              items[idx].statusId != statusID
        else { return }

        let previous = items[idx]
        localEdits += 1
        items[idx].statusId = statusID
        items[idx].timeInStatusMinutes = 0

        do {
            let _: APIClient.Empty = try await api.post("/api/items/\(itemID)/move", body: MoveRequest(statusId: statusID))
        } catch {
            if let i = items.firstIndex(where: { $0.id == itemID }) { items[i] = previous }
            errorMessage = "Couldn't move \"\(previous.title)\": \(error.localizedDescription)"
        }
    }

    // MARK: - Create / edit / delete (ports of BoardContext createItem/updateItem/deleteItem)

    struct NewItem: Encodable {
        var title: String
        var projectId: String
        var epicId: String?
        var priority: Int
        var estimateMinutes: Int?
    }

    /// Creates an item (it lands in the board's first status) and re-syncs. Throws so the form can show the error.
    func create(_ new: NewItem) async throws {
        let item: Item = try await api.post("/api/items", body: new)
        localEdits += 1
        items.append(item)
        await resync()
    }

    struct ItemChanges: Encodable {
        var title: String
        var priority: Int
        var estimateMinutes: Int?
        var epicId: String?
        var clearEpic: Bool
    }

    /// Saves edits from the item sheet. The server keeps fields it doesn't receive.
    func update(_ itemID: String, _ changes: ItemChanges) async throws {
        let _: APIClient.Empty = try await api.send("PATCH", "/api/items/\(itemID)", body: changes)
        localEdits += 1
        if let i = items.firstIndex(where: { $0.id == itemID }) {
            let epic = changes.clearEpic ? nil : epics.first { $0.id == changes.epicId }
            items[i].title = changes.title
            items[i].priority = changes.priority
            items[i].estimateMinutes = changes.estimateMinutes ?? items[i].estimateMinutes
            if changes.clearEpic || epic != nil {
                items[i].epicId = epic?.id
                items[i].epicName = epic?.name
                items[i].epicColor = epic?.color
            }
        }
        await resync()
    }

    /// Soft delete, optimistic. The item can be restored with `undoDelete()`.
    func delete(_ itemID: String) async {
        guard let i = items.firstIndex(where: { $0.id == itemID }) else { return }
        let removed = items.remove(at: i)
        localEdits += 1
        do {
            let _: APIClient.Empty = try await api.send("DELETE", "/api/items/\(itemID)", body: Optional<APIClient.Empty>.none)
            recentlyDeleted = removed
        } catch {
            items.insert(removed, at: min(i, items.count))
            errorMessage = "Couldn't delete \"\(removed.title)\": \(error.localizedDescription)"
        }
    }

    func undoDelete() async {
        guard let item = recentlyDeleted else { return }
        recentlyDeleted = nil
        localEdits += 1
        items.append(item)
        do {
            let _: APIClient.Empty = try await api.post("/api/items/\(item.id)/restore", body: APIClient.Empty())
            await resync()
        } catch {
            items.removeAll { $0.id == item.id }
            errorMessage = "Couldn't restore \"\(item.title)\": \(error.localizedDescription)"
        }
    }

    func dismissUndo() { recentlyDeleted = nil }

    /// After our own change succeeds, pull the server's view (enriched fields, positions, IDs).
    private func resync() async {
        if let snapshot = try? await fetch() { apply(snapshot) }
    }

    /// /api/sprints/active returns 404 when no sprint is running.
    private func activeSprintOrNil() async throws -> Sprint? {
        do {
            return try await api.get("/api/sprints/active") as Sprint
        } catch let error as APIError where error.status == 404 {
            return nil
        }
    }
}

private struct MoveRequest: Encodable {
    let statusId: String
}
