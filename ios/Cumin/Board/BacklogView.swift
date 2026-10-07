import SwiftUI

/// Port of ui/src/views/BacklogView.tsx: every item not in a done status, with search,
/// epic/priority filters and sorting. The web table becomes one compact row per item.
struct BacklogView: View {
    @Environment(BoardStore.self) private var store

    @State private var search = ""
    @State private var selected: SelectedItem?
    @State private var isCreating = false
    // Persisted like the web's usePersistentState.
    @AppStorage("backlog.epic") private var epicFilter = ""
    @AppStorage("backlog.priority") private var priorityFilter = -1
    @AppStorage("backlog.sortKey") private var sortKey = SortKey.priority
    @AppStorage("backlog.sortAscending") private var sortAscending = true

    enum SortKey: String, CaseIterable, Identifiable {
        case id = "ID", title = "Work", epic = "Epic", estimate = "Estimate"
        case status = "Status", priority = "Priority", waiting = "Waiting"
        var id: String { rawValue }
    }

    private var activeFilters: Int { (epicFilter.isEmpty ? 0 : 1) + (priorityFilter < 0 ? 0 : 1) }

    private var rows: [Item] {
        let doneIDs = Set(store.statuses.filter(\.isDone).map(\.id))
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        let filtered = store.items.filter { item in
            if doneIDs.contains(item.statusId) { return false }
            if !epicFilter.isEmpty && item.epicName != epicFilter { return false }
            if priorityFilter >= 0 && item.priority != priorityFilter { return false }
            if !query.isEmpty && !item.title.lowercased().contains(query) && !item.displayId.lowercased().contains(query) {
                return false
            }
            return true
        }
        return filtered.sorted { a, b in
            let ordered: Bool
            switch sortKey {
            case .id: ordered = a.displayId.localizedStandardCompare(b.displayId) == .orderedAscending
            case .title: ordered = a.title.lowercased() < b.title.lowercased()
            case .epic: ordered = (a.epicName ?? "") < (b.epicName ?? "")
            case .estimate: ordered = (a.estimateMinutes ?? 0) < (b.estimateMinutes ?? 0)
            case .status: ordered = statusName(a) < statusName(b)
            case .priority: ordered = a.priority < b.priority
            case .waiting: ordered = (a.timeInStatusMinutes ?? 0) < (b.timeInStatusMinutes ?? 0)
            }
            return sortAscending ? ordered : !ordered && !same(a, b)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(rows) { item in
                        BacklogRow(item: item, statusName: statusName(item))
                            .contentShape(Rectangle())
                            .onTapGesture { selected = SelectedItem(id: item.id) }
                            .listRowBackground(Theme.canvas)
                            .listRowSeparatorTint(Theme.line)
                    }
                    if rows.isEmpty && store.hasLoaded {
                        Text(activeFilters > 0 || !search.isEmpty ? "No backlog items matching filters" : "No backlog items")
                            .font(Theme.mono(.footnote))
                            .foregroundStyle(Theme.ghost)
                            .frame(maxWidth: .infinity, minHeight: 80)
                            .listRowBackground(Theme.canvas)
                    }
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
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search backlog…")
            .refreshable { await store.load() }
            .navigationTitle("Backlog")
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
        .tint(Theme.accent)
    }

    /// Epic / Priority / Sort menus, Clear, and the "N items · total" summary.
    private var filterBar: some View {
        HStack(spacing: 8) {
            Menu {
                Picker("Epic", selection: $epicFilter) {
                    Text("All epics").tag("")
                    ForEach(store.epics) { Text($0.name).tag($0.name) }
                }
            } label: { chip(epicFilter.isEmpty ? "Epic" : epicFilter, active: !epicFilter.isEmpty) }

            Menu {
                Picker("Priority", selection: $priorityFilter) {
                    Text("All priorities").tag(-1)
                    ForEach(0..<5, id: \.self) { Text("P\($0)").tag($0) }
                }
            } label: { chip(priorityFilter < 0 ? "Priority" : "P\(priorityFilter)", active: priorityFilter >= 0) }

            Menu {
                Picker("Sort by", selection: $sortKey) {
                    ForEach(SortKey.allCases) { Text($0.rawValue).tag($0) }
                }
                Button(sortAscending ? "Descending" : "Ascending") { sortAscending.toggle() }
            } label: {
                // Icon-only so the row fits next to the filters; the menu shows the current sort.
                Image(systemName: sortAscending ? "arrow.up" : "arrow.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.dim)
                    .frame(width: 30, height: 26)
                    .background(Theme.surface)
                    .overlay(Rectangle().stroke(Theme.line, lineWidth: 1))
                    .accessibilityLabel("Sort by \(sortKey.rawValue)")
            }

            if activeFilters > 0 {
                Button("Clear (\(activeFilters))") {
                    epicFilter = ""
                    priorityFilter = -1
                }
                .font(Theme.mono(.caption))
                .foregroundStyle(Theme.accent)
            }

            Spacer(minLength: 0)
            Text("\(rows.count) · \(Format.estimate(rows.reduce(0) { $0 + ($1.estimateMinutes ?? 0) }))")
                .font(Theme.mono(.caption2))
                .foregroundStyle(Theme.ghost)
        }
        .textCase(nil)
        .padding(.vertical, 6)
    }

    private func chip(_ text: String, active: Bool) -> some View {
        HStack(spacing: 4) {
            Text(text).lineLimit(1)
            Image(systemName: "chevron.down").font(.system(size: 9, weight: .semibold))
        }
        .font(Theme.mono(.caption, weight: .medium))
        .foregroundStyle(active ? Theme.accent : Theme.dim)
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(active ? Theme.accent.opacity(0.1) : Theme.surface)
        .overlay(Rectangle().stroke(active ? Theme.accent.opacity(0.4) : Theme.line, lineWidth: 1))
    }

    private func statusName(_ item: Item) -> String {
        store.statuses.first { $0.id == item.statusId }?.name ?? "—"
    }

    /// Keeps the sort stable when values tie, so rows don't jump on each sync.
    private func same(_ a: Item, _ b: Item) -> Bool {
        switch sortKey {
        case .id: a.displayId == b.displayId
        case .title: a.title.lowercased() == b.title.lowercased()
        case .epic: (a.epicName ?? "") == (b.epicName ?? "")
        case .estimate: (a.estimateMinutes ?? 0) == (b.estimateMinutes ?? 0)
        case .status: statusName(a) == statusName(b)
        case .priority: a.priority == b.priority
        case .waiting: (a.timeInStatusMinutes ?? 0) == (b.timeInStatusMinutes ?? 0)
        }
    }
}

/// One backlog item: the web table's columns stacked into three lines.
private struct BacklogRow: View {
    let item: Item
    let statusName: String

    var body: some View {
        let priority = PriorityStyle.of(item.priority)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(item.displayId)
                    .font(Theme.mono(.caption, weight: .medium))
                    .foregroundStyle(Theme.accent)
                Text(priority.label)
                    .font(Theme.mono(.caption, weight: .bold))
                    .foregroundStyle(priority.color)
                Spacer()
                Text(statusName)
                    .font(Theme.mono(.caption2, weight: .semibold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.line)
                    .foregroundStyle(Theme.ink.opacity(0.8))
            }

            Text(item.title)
                .font(Theme.mono(.subheadline, weight: .medium))
                .foregroundStyle(Theme.ink)

            HStack(spacing: 10) {
                if let name = item.epicName {
                    let color = Color(hex: item.epicColor ?? "#6b7280")
                    Text(name)
                        .font(Theme.mono(.caption2, weight: .semibold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .foregroundStyle(color)
                        .background(color.opacity(0.09))
                        .overlay(Rectangle().stroke(color.opacity(0.15), lineWidth: 1))
                }
                Text(item.estimateMinutes.map(Format.estimate) ?? "—")
                    .font(Theme.mono(.caption, weight: .semibold))
                    .foregroundStyle(Theme.ink.opacity(0.8))
                Spacer(minLength: 12)
                StatusDurationBar(minutes: item.timeInStatusMinutes, estimateMinutes: item.estimateMinutes)
                    .frame(maxWidth: 140)
            }
        }
        .padding(.vertical, 6)
    }
}
