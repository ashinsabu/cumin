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
        let sprint: Sprint?
    }

    private func fetch() async throws -> Snapshot {
        async let board: Board = api.get("/api/board")
        async let statuses: StatusList = api.get("/api/board/statuses")
        async let items: ItemList = api.get("/api/items")
        async let epics: EpicList = api.get("/api/epics")
        async let sprint = activeSprintOrNil()
        return try await Snapshot(
            board: board,
            statuses: (statuses.statuses ?? []).sorted { $0.position < $1.position },
            items: items.items ?? [],
            epics: epics.epics ?? [],
            sprint: sprint
        )
    }

    private func apply(_ s: Snapshot) {
        // Assign only what changed, so SwiftUI doesn't redraw the board every poll.
        if board != s.board { board = s.board }
        if statuses != s.statuses { statuses = s.statuses }
        if items != s.items { items = s.items }
        if epics != s.epics { epics = s.epics }
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
