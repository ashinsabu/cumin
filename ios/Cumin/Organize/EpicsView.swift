import SwiftUI

/// Port of ui/src/views/EpicsView.tsx (list mode): search, type filter, sort, progress per epic.
struct EpicsView: View {
    @Environment(BoardStore.self) private var store

    @AppStorage("epics.search") private var search = ""
    @AppStorage("epics.type") private var typeFilter = ""
    @AppStorage("epics.sortKey") private var sortKey = SortKey.name
    @AppStorage("epics.sortAscending") private var sortAscending = true
    @State private var selectedEpic: SelectedItem?
    @State private var isCreating = false

    enum SortKey: String, CaseIterable, Identifiable {
        case name = "Epic", type = "Type", items = "Items", estimate = "Estimate", progress = "Progress", deadline = "Deadline"
        var id: String { rawValue }
    }

    private static let types = [("goal", "Goal"), ("recurring", "Recurring"), ("catchall", "Catch-all")]

    private var rows: [EpicStats] {
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        let filtered = store.epics.map(store.stats(for:)).filter { row in
            if !typeFilter.isEmpty && row.epic.type != typeFilter { return false }
            if !query.isEmpty && !row.epic.name.lowercased().contains(query)
                && !row.epic.description.lowercased().contains(query) { return false }
            return true
        }
        return filtered.sorted { a, b in
            let (x, y) = sortAscending ? (a, b) : (b, a)
            switch sortKey {
            case .name: return x.epic.name.lowercased() < y.epic.name.lowercased()
            case .type: return x.epic.type < y.epic.type
            case .items: return x.items.count < y.items.count
            case .estimate: return x.totalEstimate < y.totalEstimate
            case .progress: return x.progress < y.progress
            case .deadline: return (x.epic.deadline ?? "9999") < (y.epic.deadline ?? "9999")
            }
        }
    }

    var body: some View {
        Group {
            List {
                ForEach(rows, id: \.epic.id) { row in
                    EpicRow(stats: row)
                        .contentShape(Rectangle())
                        .onTapGesture { selectedEpic = SelectedItem(id: row.epic.id) }
                        .listRowBackground(Theme.canvas)
                        .listRowSeparatorTint(Theme.line)
                }
                if rows.isEmpty && store.hasLoaded {
                    Text("No epics found.")
                        .font(Theme.mono(.footnote))
                        .foregroundStyle(Theme.ghost)
                        .frame(maxWidth: .infinity, minHeight: 80)
                        .listRowBackground(Theme.canvas)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.canvas)
            .safeAreaInset(edge: .top, spacing: 0) {
                filterBar.padding(.horizontal, 16).background(Theme.canvas)
            }
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search epics…")
            .refreshable { await store.load() }
            .navigationTitle("Epics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { isCreating = true } label: { Image(systemName: "plus").accessibilityLabel("New epic") }
                }
            }
            .sheet(item: $selectedEpic) {
                EpicDetailView(epicID: $0.id)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $isCreating) {
                CreateEpicView()
                    .presentationDetents([.large])
            }
            .task { if !store.hasLoaded { await store.load() } }
        }
        .tint(Theme.accent)
    }

    private var filterBar: some View {
        HStack(spacing: 8) {
            Menu {
                Picker("Type", selection: $typeFilter) {
                    Text("All types").tag("")
                    ForEach(Self.types, id: \.0) { Text($0.1).tag($0.0) }
                }
            } label: {
                FilterChip(text: Self.types.first { $0.0 == typeFilter }?.1 ?? "Type", active: !typeFilter.isEmpty)
            }

            SortMenu(keys: SortKey.allCases, selection: $sortKey, ascending: $sortAscending)

            Spacer(minLength: 0)
            Text("\(rows.count) epics")
                .font(Theme.mono(.caption2))
                .foregroundStyle(Theme.ghost)
        }
        .padding(.vertical, 6)
    }
}

private struct EpicRow: View {
    let stats: EpicStats

    var body: some View {
        let color = Color(hex: stats.epic.color)
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Circle().fill(color).frame(width: 10, height: 10)
                Text(stats.epic.name)
                    .font(Theme.mono(.subheadline, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Spacer()
                EpicTypeBadge(type: stats.epic.type)
            }
            HStack(spacing: 10) {
                Text("\(stats.doneCount)").foregroundStyle(Theme.ink) + Text("/\(stats.items.count)").foregroundStyle(Theme.ghost)
                Text(stats.totalEstimate > 0 ? Format.estimate(stats.totalEstimate) : "—")
                    .foregroundStyle(Theme.ink.opacity(0.8))
                ProgressLine(progress: stats.progress, color: color)
                Text("\(stats.progress)%").foregroundStyle(Theme.dim).frame(width: 36, alignment: .trailing)
                DeadlineChip(daysLeft: stats.daysLeft).frame(minWidth: 52, alignment: .trailing)
            }
            .font(Theme.mono(.caption, weight: .medium))
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Filter bar pieces (shared with Backlog-style screens)

struct FilterChip: View {
    let text: String
    let active: Bool

    var body: some View {
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
}

struct SortMenu<Key: Hashable & Identifiable & RawRepresentable>: View where Key.RawValue == String {
    let keys: [Key]
    @Binding var selection: Key
    @Binding var ascending: Bool

    var body: some View {
        Menu {
            Picker("Sort by", selection: $selection) {
                ForEach(keys) { Text($0.rawValue).tag($0) }
            }
            Button(ascending ? "Descending" : "Ascending") { ascending.toggle() }
        } label: {
            Image(systemName: ascending ? "arrow.up" : "arrow.down")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.dim)
                .frame(width: 30, height: 26)
                .background(Theme.surface)
                .overlay(Rectangle().stroke(Theme.line, lineWidth: 1))
                .accessibilityLabel("Sort by \(selection.rawValue)")
        }
    }
}
