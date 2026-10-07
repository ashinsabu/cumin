import SwiftUI

/// Ports of ui/src/views/BacklogView.tsx and AllItemsView.tsx, which are the same table with
/// different rules. The web table becomes one compact row per item.
///  - Backlog: items not in a done status; epic/priority filters; sorted by priority.
///  - All Items: every item; adds a status filter, a Created sort (newest first) and epic search.
struct ItemListView: View {
    enum Kind {
        case backlog, all

        var title: String { self == .backlog ? "Backlog" : "All Items" }
        fileprivate var storageKey: String { self == .backlog ? "backlog" : "items" }
        fileprivate var defaultSort: SortKey { self == .backlog ? .priority : .created }
    }

    enum SortKey: String, CaseIterable, Identifiable {
        case id = "ID", title = "Work", epic = "Epic", estimate = "Estimate", created = "Created"
        case status = "Status", priority = "Priority", waiting = "In status"
        var id: String { rawValue }
    }

    @Environment(BoardStore.self) private var store
    let kind: Kind

    @State private var search = ""
    @State private var selected: SelectedItem?
    @State private var isCreating = false
    // Persisted per screen, like the web's usePersistentState.
    @AppStorage private var epicFilter: String
    @AppStorage private var priorityFilter: Int
    @AppStorage private var statusFilter: String
    @AppStorage private var sortKey: SortKey
    @AppStorage private var sortAscending: Bool

    init(kind: Kind) {
        self.kind = kind
        let key = kind.storageKey
        _epicFilter = AppStorage(wrappedValue: "", "\(key).epic")
        _priorityFilter = AppStorage(wrappedValue: -1, "\(key).priority")
        _statusFilter = AppStorage(wrappedValue: "", "\(key).status")
        _sortKey = AppStorage(wrappedValue: kind.defaultSort, "\(key).sortKey")
        _sortAscending = AppStorage(wrappedValue: kind == .backlog, "\(key).sortAscending")
    }

    private var sortKeys: [SortKey] { kind == .all ? SortKey.allCases : SortKey.allCases.filter { $0 != .created } }

    private var activeFilters: Int {
        (epicFilter.isEmpty ? 0 : 1) + (priorityFilter < 0 ? 0 : 1) + (kind == .all && !statusFilter.isEmpty ? 1 : 0)
    }

    private var rows: [Item] {
        let doneIDs = Set(store.statuses.filter(\.isDone).map(\.id))
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        let filtered = store.items.filter { item in
            if kind == .backlog && doneIDs.contains(item.statusId) { return false }
            if !epicFilter.isEmpty && item.epicName != epicFilter { return false }
            if priorityFilter >= 0 && item.priority != priorityFilter { return false }
            if kind == .all && !statusFilter.isEmpty && item.statusId != statusFilter { return false }
            if !query.isEmpty {
                let epicMatch = kind == .all && (item.epicName ?? "").lowercased().contains(query)
                if !item.title.lowercased().contains(query) && !item.displayId.lowercased().contains(query) && !epicMatch {
                    return false
                }
            }
            return true
        }
        return filtered.sorted { a, b in
            let (x, y) = sortAscending ? (a, b) : (b, a)
            switch sortKey {
            case .id: return x.displayId.localizedStandardCompare(y.displayId) == .orderedAscending
            case .title: return x.title.lowercased() < y.title.lowercased()
            case .epic: return (x.epicName ?? "") < (y.epicName ?? "")
            case .estimate: return (x.estimateMinutes ?? 0) < (y.estimateMinutes ?? 0)
            case .created: return (x.createdAt ?? .distantPast) < (y.createdAt ?? .distantPast)
            case .status: return statusName(x) < statusName(y)
            case .priority: return x.priority < y.priority
            case .waiting: return (x.timeInStatusMinutes ?? 0) < (y.timeInStatusMinutes ?? 0)
            }
        }
    }

    var body: some View {
        List {
            ForEach(rows) { item in
                ItemListRow(item: item, statusName: statusName(item), showCreated: kind == .all)
                    .contentShape(Rectangle())
                    .onTapGesture { selected = SelectedItem(id: item.id) }
                    .listRowBackground(Theme.canvas)
                    .listRowSeparatorTint(Theme.line)
            }
            if rows.isEmpty && store.hasLoaded {
                Text(emptyText)
                    .font(Theme.font(.footnote))
                    .foregroundStyle(Theme.ghost)
                    .frame(maxWidth: .infinity, minHeight: 80)
                    .listRowBackground(Theme.canvas)
            }
        }
        .listStyle(.plain)
        // Filters stay pinned under the search bar instead of scrolling as a list header.
        .safeAreaInset(edge: .top, spacing: 0) {
            filterBar
                .padding(.horizontal, 16)
                .background(Theme.canvas)
        }
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always),
                    prompt: kind == .backlog ? "Search backlog…" : "Search items…")
        .refreshable { await store.load() }
        .navigationTitle(kind.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { isCreating = true } label: { Image(systemName: "plus").accessibilityLabel("New item") }
                    .disabled(store.projects.isEmpty)
            }
        }
        .sheet(item: $selected) {
            ItemDetailView(itemID: $0.id)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $isCreating) { CreateItemView() }
        .task { if !store.hasLoaded { await store.load() } }
    }

    private var emptyText: String {
        let what = kind == .backlog ? "backlog items" : "items"
        return activeFilters > 0 || !search.isEmpty ? "No \(what) matching filters" : "No \(what)"
    }

    /// Epic / Priority (/ Status) filters, sort, Clear, and the "N · total estimate" summary.
    private var filterBar: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                Menu {
                    Picker("Epic", selection: $epicFilter) {
                        Text("All epics").tag("")
                        ForEach(store.epics) { Text($0.name).tag($0.name) }
                    }
                } label: { FilterChip(text: epicFilter.isEmpty ? "Epic" : epicFilter, active: !epicFilter.isEmpty) }

                Menu {
                    Picker("Priority", selection: $priorityFilter) {
                        Text("All priorities").tag(-1)
                        ForEach(0..<5, id: \.self) { Text("P\($0)").tag($0) }
                    }
                } label: { FilterChip(text: priorityFilter < 0 ? "Priority" : "P\(priorityFilter)", active: priorityFilter >= 0) }

                if kind == .all {
                    Menu {
                        Picker("Status", selection: $statusFilter) {
                            Text("All statuses").tag("")
                            ForEach(store.statuses) { Text($0.name).tag($0.id) }
                        }
                    } label: {
                        FilterChip(text: store.statuses.first { $0.id == statusFilter }?.name ?? "Status", active: !statusFilter.isEmpty)
                    }
                }

                SortMenu(keys: sortKeys, selection: $sortKey, ascending: $sortAscending)

                if activeFilters > 0 {
                    Button("Clear (\(activeFilters))") {
                        epicFilter = ""
                        priorityFilter = -1
                        statusFilter = ""
                    }
                    .font(Theme.font(.caption))
                    .foregroundStyle(Theme.accent)
                }

                Text("\(rows.count) · \(Format.estimate(rows.reduce(0) { $0 + ($1.estimateMinutes ?? 0) }))")
                    .font(Theme.font(.caption2))
                    .foregroundStyle(Theme.ghost)
                    .padding(.leading, 4)
            }
            .padding(.vertical, 6)
        }
        .scrollIndicators(.hidden)
    }

    private func statusName(_ item: Item) -> String {
        store.statuses.first { $0.id == item.statusId }?.name ?? "—"
    }
}

/// One item: the web table's columns stacked into three lines.
private struct ItemListRow: View {
    let item: Item
    let statusName: String
    let showCreated: Bool

    var body: some View {
        let priority = PriorityStyle.of(item.priority)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(item.displayId)
                    .font(Theme.code(.caption, weight: .medium))
                    .foregroundStyle(Theme.accent)
                Text(priority.label)
                    .font(Theme.font(.caption, weight: .bold))
                    .foregroundStyle(priority.color)
                if showCreated, let created = item.createdAt {
                    Text(created.formatted(.dateTime.day().month(.abbreviated)))
                        .font(Theme.font(.caption2))
                        .foregroundStyle(Theme.ghost)
                }
                Spacer()
                Text(statusName)
                    .font(Theme.font(.caption2, weight: .semibold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.line)
                    .themedClip()
                    .foregroundStyle(Theme.ink.opacity(0.8))
            }

            Text(item.title)
                .font(Theme.font(.subheadline, weight: .medium))
                .foregroundStyle(Theme.ink)

            HStack(spacing: 10) {
                if let name = item.epicName {
                    let color = Color(hex: item.epicColor ?? "#6b7280")
                    Text(name)
                        .font(Theme.font(.caption2, weight: .semibold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .foregroundStyle(color)
                        .background(color.opacity(0.09))
                        .themedBorder(color.opacity(0.15), radius: .badge)
                }
                Text(item.estimateMinutes.map(Format.estimate) ?? "—")
                    .font(Theme.font(.caption, weight: .semibold))
                    .foregroundStyle(Theme.ink.opacity(0.8))
                Spacer(minLength: 12)
                StatusDurationBar(minutes: item.timeInStatusMinutes, estimateMinutes: item.estimateMinutes)
                    .frame(maxWidth: 140)
            }
        }
        .padding(.vertical, 6)
    }
}
