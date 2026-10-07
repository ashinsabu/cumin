import SwiftUI

/// Port of ui/src/views/BoardView.tsx: one kanban column per status.
/// On a phone, columns scroll horizontally and snap one at a time.
struct BoardView: View {
    @Environment(BoardStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    @State private var selected: SelectedItem?
    @State private var isCreating = false

    /// How often the board re-syncs while it's on screen.
    private static let pollInterval: Duration = .seconds(15)

    var body: some View {
        Group {
            Group {
                if !store.hasLoaded {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if store.statuses.isEmpty {
                    ContentUnavailableView(
                        "Board unavailable",
                        systemImage: "exclamationmark.triangle",
                        description: Text(store.errorMessage ?? "No statuses found.")
                    )
                } else {
                    columns
                }
            }
            .background(Theme.canvas)
            .navigationTitle(store.board?.name ?? "Board")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { header }
                ToolbarItem(placement: .primaryAction) {
                    Button { isCreating = true } label: { Image(systemName: "plus").accessibilityLabel("New item") }
                        .accessibilityIdentifier("add-item-button")
                        .disabled(store.projects.isEmpty)
                }
            }
            .sheet(item: $selected) {
                ItemDetailView(itemID: $0.id)
                    // Open at half height; drag up for full screen.
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $isCreating) { CreateItemView() }

            .task {
                if !store.hasLoaded { await store.load() }
                #if DEBUG
                // Simulator screenshots: `-debugOpenItem RAJ-1` opens that item's sheet.
                if let displayID = UserDefaults.standard.string(forKey: "debugOpenItem"),
                   let item = store.items.first(where: { $0.displayId == displayID }) {
                    selected = SelectedItem(id: item.id)
                }
                #endif
            }
            // Poll while the board is visible; SwiftUI cancels this when the tab is left.
            .task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: Self.pollInterval)
                    if scenePhase == .active { await store.refresh() }
                }
            }
            // Catch up immediately when returning to the app.
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await store.refresh() } }
            }
            .alert("Something went wrong", isPresented: errorBinding) {
                Button("OK") { store.errorMessage = nil }
            } message: {
                Text(store.errorMessage ?? "")
            }
        }
    }

    private var columns: some View {
        ScrollView(.horizontal) {
            LazyHStack(alignment: .top, spacing: 12) {
                ForEach(Array(store.statuses.enumerated()), id: \.element.id) { index, status in
                    BoardColumn(status: status, tint: tint(for: status, at: index)) { selected = SelectedItem(id: $0.id) }
                        .containerRelativeFrame(.horizontal) { width, _ in width * 0.85 }
                }
            }
            .scrollTargetLayout()
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .scrollTargetBehavior(.viewAligned)
        .scrollIndicators(.hidden)
        .refreshable { await store.load() }
    }

    private var header: some View {
        VStack(spacing: 1) {
            Text(store.board?.name ?? "Board")
                .font(Theme.font(.headline, weight: .bold))
                .foregroundStyle(Theme.ink)
            Group {
                if let sprint = store.activeSprint {
                    Text("\(sprint.name) · \(store.items.count) items · \(Format.estimate(store.plannedMinutes)) planned")
                } else {
                    Text("No active sprint · \(store.items.count) items")
                }
            }
            .font(Theme.font(.caption2))
            .foregroundStyle(Theme.dim)
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.errorMessage != nil && store.hasLoaded && !store.statuses.isEmpty },
            set: { if !$0 { store.errorMessage = nil } }
        )
    }

    /// Same column tints as the web: grey for the first status, green for done,
    /// and red → blue → amber → violet for the ones in between.
    private func tint(for status: Status, at index: Int) -> Color {
        if status.isInitial { return Color(hex: "#71717a") }
        if status.isDone { return Color(hex: "#10b981") }
        let middle = store.statuses.prefix(index).filter { !$0.isInitial && !$0.isDone }.count
        let cycle = ["#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6"]
        return Color(hex: cycle[middle % cycle.count])
    }
}

/// Wraps an item ID for `.sheet(item:)`.
struct SelectedItem: Identifiable {
    let id: String
}

private struct BoardColumn: View {
    @Environment(BoardStore.self) private var store
    let status: Status
    let tint: Color
    let onSelect: (Item) -> Void
    @State private var isTargeted = false

    var body: some View {
        let items = store.items(in: status)
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(status.name.uppercased())
                    .font(Theme.font(.caption, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(Theme.dim)
                Text("\(items.count)")
                    .font(Theme.font(.caption2, weight: .medium))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.line)
                    .themedClip()
                    .foregroundStyle(Theme.dim)
            }
            .padding(.horizontal, 4)

            ScrollView(.vertical) {
                LazyVStack(spacing: 8) {
                    ForEach(items) { item in
                        ItemCard(item: item)
                            .onTapGesture { onSelect(item) }
                            .draggable(item.id) {
                                ItemCard(item: item).frame(width: 260).rotationEffect(.degrees(1))
                            }
                            .contextMenu { moveMenu(for: item) }
                    }
                    if items.isEmpty {
                        Text("Drop items here")
                            .font(Theme.font(.caption))
                            .foregroundStyle(Theme.ghost)
                            .frame(maxWidth: .infinity, minHeight: 80)
                    }
                }
                .padding(10)
            }
            .scrollIndicators(.hidden)
            .frame(maxHeight: .infinity, alignment: .top)
            .background(isTargeted ? Theme.accent.opacity(0.06) : tint.opacity(0.08))
            .themedBorder(isTargeted ? Theme.accent.opacity(0.3) : tint.opacity(0.15))
            .dropDestination(for: String.self) { ids, _ in
                guard let id = ids.first else { return false }
                Task { await store.move(itemID: id, to: status.id) }
                return true
            } isTargeted: { isTargeted = $0 }
        }
    }

    /// Long-press alternative to dragging (easier one-handed).
    @ViewBuilder
    private func moveMenu(for item: Item) -> some View {
        Button { onSelect(item) } label: { Label("Open", systemImage: "square.and.pencil") }
        Section("Move to") {
            ForEach(store.statuses.filter { $0.id != item.statusId }) { target in
                Button(target.name) {
                    Task { await store.move(itemID: item.id, to: target.id) }
                }
            }
        }
    }
}
