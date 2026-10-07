import SwiftUI

/// Port of ui/src/views/ItemsView.tsx (replaces Backlog + All Items, like the web).
/// Filters: project, epic, status, priority, hide done; search; sort. Any filter set can be saved
/// as a named view ("My Views"), shared with the web via /api/views.
struct ItemsView: View {
    enum SortKey: String, CaseIterable, Identifiable {
        case id = "ID", title = "Work", project = "Project", epic = "Epic", estimate = "Estimate"
        case created = "Created", status = "Status", priority = "Priority", waiting = "In status"
        var id: String { rawValue }
    }

    @Environment(BoardStore.self) private var store

    @State private var search = ""
    @State private var selected: SelectedItem?
    @State private var isCreating = false
    @State private var isSavingView = false
    @State private var newViewName = ""
    @State private var pendingViewDelete: SavedView?
    // Persisted like the web's URL params / usePersistentState. More → My Views writes these too.
    @AppStorage(ItemFilters.Keys.project) private var projectFilter = ""
    @AppStorage(ItemFilters.Keys.epic) private var epicFilter = ""
    @AppStorage(ItemFilters.Keys.status) private var statusFilter = ""
    @AppStorage(ItemFilters.Keys.priority) private var priorityFilter = -1
    @AppStorage(ItemFilters.Keys.hideDone) private var hideDone = false
    @AppStorage("items.sortKey") private var sortKey = SortKey.created
    @AppStorage("items.sortAscending") private var sortAscending = false

    private var currentFilters: SavedView.Filters {
        .init(projectId: projectFilter.isEmpty ? nil : projectFilter,
              epicId: epicFilter.isEmpty ? nil : epicFilter,
              statusId: statusFilter.isEmpty ? nil : statusFilter,
              priority: priorityFilter < 0 ? nil : priorityFilter,
              hideDone: hideDone ? true : nil)
    }

    private var activeFilterCount: Int {
        [projectFilter, epicFilter, statusFilter].filter { !$0.isEmpty }.count + (priorityFilter < 0 ? 0 : 1) + (hideDone ? 1 : 0)
    }

    private var rows: [Item] {
        let doneIDs = Set(store.statuses.filter(\.isDone).map(\.id))
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        let filtered = store.items.filter { item in
            if !projectFilter.isEmpty && item.projectId != projectFilter { return false }
            if !epicFilter.isEmpty && item.epicId != epicFilter { return false }
            if !statusFilter.isEmpty && item.statusId != statusFilter { return false }
            if priorityFilter >= 0 && item.priority != priorityFilter { return false }
            if hideDone && doneIDs.contains(item.statusId) { return false }
            if !query.isEmpty && !item.title.lowercased().contains(query)
                && !item.displayId.lowercased().contains(query)
                && !(item.epicName ?? "").lowercased().contains(query) { return false }
            return true
        }
        return filtered.sorted { a, b in
            let (x, y) = sortAscending ? (a, b) : (b, a)
            switch sortKey {
            case .id: return x.displayId.localizedStandardCompare(y.displayId) == .orderedAscending
            case .title: return x.title.lowercased() < y.title.lowercased()
            case .project: return projectName(x) < projectName(y)
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
                ItemRow(item: item, statusName: statusName(item), project: store.projects.first { $0.id == item.projectId })
                    .contentShape(Rectangle())
                    .onTapGesture { selected = SelectedItem(id: item.id) }
                    .listRowBackground(Theme.canvas)
                    .listRowSeparatorTint(Theme.line)
            }
            if rows.isEmpty && store.hasLoaded {
                Text(activeFilterCount > 0 || !search.isEmpty ? "No items matching filters" : "No items")
                    .font(Theme.font(.footnote))
                    .foregroundStyle(Theme.ghost)
                    .frame(maxWidth: .infinity, minHeight: 80)
                    .listRowBackground(Theme.canvas)
            }
        }
        .listStyle(.plain)
        .safeAreaInset(edge: .top, spacing: 0) {
            VStack(spacing: 0) {
                if !store.views.isEmpty || activeFilterCount > 0 { viewsBar }
                filterBar
            }
            .padding(.horizontal, 16)
            .background(Theme.canvas)
        }
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search items…")
        .refreshable { await store.load() }
        .navigationTitle("Items")
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
        .alert("Save this view", isPresented: $isSavingView) {
            TextField("View name…", text: $newViewName)
            Button("Cancel", role: .cancel) { newViewName = "" }
            Button("Save") {
                let name = newViewName.trimmingCharacters(in: .whitespaces)
                newViewName = ""
                guard !name.isEmpty else { return }
                let filters = currentFilters
                Task { try? await store.createView(name: name, filters: filters) }
            }
        }
        .confirmationDialog("Delete view \"\(pendingViewDelete?.name ?? "")\"?",
                            isPresented: Binding(get: { pendingViewDelete != nil }, set: { if !$0 { pendingViewDelete = nil } }),
                            titleVisibility: .visible) {
            Button("Delete view", role: .destructive) {
                if let view = pendingViewDelete { Task { await store.deleteView(view.id) } }
            }
        }
        .task { if !store.hasLoaded { await store.load() } }
    }

    // MARK: Saved views

    /// All · each saved view · Save view (shown when filters are active and not already a saved view).
    private var viewsBar: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                viewChip("All", active: activeFilterCount == 0) { ItemFilters.apply(.init()) }
                ForEach(store.views) { view in
                    viewChip(view.name, active: view.filters == currentFilters) { ItemFilters.apply(view.filters) }
                        .contextMenu {
                            Button("Delete view", systemImage: "trash", role: .destructive) { pendingViewDelete = view }
                        }
                }
                if activeFilterCount > 0 && !store.views.contains(where: { $0.filters == currentFilters }) {
                    Button { isSavingView = true } label: {
                        Label("Save view", systemImage: "bookmark")
                            .font(Theme.font(.caption, weight: .medium))
                            .foregroundStyle(Theme.accent)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("save-view")
                }
            }
            .padding(.vertical, 6)
        }
        .scrollIndicators(.hidden)
    }

    private func viewChip(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(Theme.font(.caption, weight: active ? .semibold : .medium))
                .lineLimit(1)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .foregroundStyle(active ? Theme.accent : Theme.dim)
                .background(active ? Theme.accent.opacity(0.1) : .clear)
                .themedBorder(active ? Theme.accent.opacity(0.4) : Theme.line)
        }
        .buttonStyle(.plain)
    }

    // MARK: Filters

    private var filterBar: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                Menu {
                    Picker("Project", selection: $projectFilter) {
                        Text("All projects").tag("")
                        ForEach(store.projects) { Text($0.name).tag($0.id) }
                    }
                } label: {
                    FilterChip(text: store.projects.first { $0.id == projectFilter }?.name ?? "Project", active: !projectFilter.isEmpty)
                }

                Menu {
                    Picker("Epic", selection: $epicFilter) {
                        Text("All epics").tag("")
                        ForEach(store.epics) { Text($0.name).tag($0.id) }
                    }
                } label: {
                    FilterChip(text: store.epics.first { $0.id == epicFilter }?.name ?? "Epic", active: !epicFilter.isEmpty)
                }

                Menu {
                    Picker("Status", selection: $statusFilter) {
                        Text("All statuses").tag("")
                        ForEach(store.statuses) { Text($0.name).tag($0.id) }
                    }
                } label: {
                    FilterChip(text: store.statuses.first { $0.id == statusFilter }?.name ?? "Status", active: !statusFilter.isEmpty)
                }

                Menu {
                    Picker("Priority", selection: $priorityFilter) {
                        Text("All priorities").tag(-1)
                        ForEach(0..<5, id: \.self) { Text("P\($0)").tag($0) }
                    }
                } label: {
                    FilterChip(text: priorityFilter < 0 ? "Priority" : "P\(priorityFilter)", active: priorityFilter >= 0)
                }

                // Web "Hide done" toggle (the old Backlog).
                Button { hideDone.toggle() } label: {
                    Label("Hide done", systemImage: hideDone ? "eye.slash" : "eye")
                        .font(Theme.font(.caption, weight: .medium))
                        .foregroundStyle(hideDone ? Theme.accent : Theme.dim)
                        .padding(.horizontal, 8).padding(.vertical, 5)
                        .background(hideDone ? Theme.accent.opacity(0.1) : Theme.surface)
                        .themedBorder(hideDone ? Theme.accent.opacity(0.4) : Theme.line)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("hide-done")

                SortMenu(keys: SortKey.allCases, selection: $sortKey, ascending: $sortAscending)

                if activeFilterCount > 0 {
                    Button("Clear (\(activeFilterCount))") { ItemFilters.apply(.init()) }
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

    private func projectName(_ item: Item) -> String {
        store.projects.first { $0.id == item.projectId }?.name ?? ""
    }
}

/// Filter state shared by Items and More → My Views (stored in UserDefaults).
enum ItemFilters {
    enum Keys {
        static let project = "items.project"
        static let epic = "items.epic"
        static let status = "items.status"
        static let priority = "items.priority"
        static let hideDone = "items.hideDone"
    }

    static func apply(_ f: SavedView.Filters) {
        let d = UserDefaults.standard
        d.set(f.projectId ?? "", forKey: Keys.project)
        d.set(f.epicId ?? "", forKey: Keys.epic)
        d.set(f.statusId ?? "", forKey: Keys.status)
        d.set(f.priority ?? -1, forKey: Keys.priority)
        d.set(f.hideDone ?? false, forKey: Keys.hideDone)
    }
}

/// One item: the web table's columns stacked into three lines.
private struct ItemRow: View {
    let item: Item
    let statusName: String
    let project: Project?

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
                if let created = item.createdAt {
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

            HStack(spacing: 8) {
                if let project {
                    Text(project.prefix)
                        .font(Theme.code(.caption2, weight: .bold))
                        .padding(.horizontal, 5).padding(.vertical, 2)
                        .foregroundStyle(Color(hex: project.color))
                        .background(Color(hex: project.color).opacity(0.1))
                        .themedClip()
                }
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
                    .frame(maxWidth: 120)
            }
        }
        .padding(.vertical, 6)
    }
}
