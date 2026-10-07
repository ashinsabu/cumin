import SwiftUI

/// Port of ui/src/components/QueueDrawer.tsx as a full tab: the "belt" of quick captures.
/// Swipe right = done, swipe left = dismiss, tap = edit / convert, long-press drag = reorder.
struct QueueView: View {
    @Environment(QueueStore.self) private var queue
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("queue.sort") private var sort = QueueStore.Sort.auto

    @State private var editing: QueueItem?
    @State private var isAdding = false
    @State private var showStale = false
    @State private var showHistory = false

    var body: some View {
        let belt = queue.sorted(queue.active, by: sort)
        List {
            if belt.isEmpty && queue.hasLoaded {
                emptyBelt.listRowBackground(Theme.canvas).listRowSeparator(.hidden)
            }
            ForEach(Array(belt.enumerated()), id: \.element.id) { index, item in
                BeltRow(item: item, index: index, total: belt.count)
                    .contentShape(Rectangle())
                    .onTapGesture { editing = item }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Theme.canvas)
                    .listRowSeparatorTint(Theme.line)
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        Button { Task { await queue.complete(item.id) } } label: { Label("Done", systemImage: "checkmark") }
                            .tint(.green)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) { Task { await queue.archive(item.id) } } label: { Label("Dismiss", systemImage: "xmark") }
                    }
            }
            .onMove { from, to in
                var ids = belt.map(\.id)
                ids.move(fromOffsets: from, toOffset: to)
                sort = .custom
                Task { await queue.reorder(ids) }
            }

            if !queue.stale.isEmpty { staleSection }
            historySection
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .refreshable { await queue.load() }
        .navigationTitle("Queue")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { header }
            ToolbarItem(placement: .topBarLeading) { sortMenu }
            ToolbarItem(placement: .primaryAction) {
                Button { isAdding = true } label: { Image(systemName: "plus").accessibilityLabel("Add to queue") }
            }
        }
        .sheet(item: $editing) { item in
            QueueEntrySheet(mode: .edit(item))
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $isAdding) {
            QueueEntrySheet(mode: .add)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .alert("Something went wrong", isPresented: Binding(get: { queue.errorMessage != nil && queue.hasLoaded },
                                                           set: { if !$0 { queue.errorMessage = nil } })) {
            Button("OK") { queue.errorMessage = nil }
        } message: {
            Text(queue.errorMessage ?? "")
        }
        // Keep the belt (and the tab's overdue badge) fresh while it's on screen.
        .task {
            await queue.load()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                if scenePhase == .active { await queue.load() }
            }
        }
    }

    // MARK: Pieces

    private var header: some View {
        HStack(spacing: 6) {
            Text("Queue").font(Theme.font(.headline, weight: .semibold)).foregroundStyle(Theme.ink).fixedSize()
            if !queue.active.isEmpty {
                Text("\(queue.active.count)")
                    .font(Theme.code(.caption2))
                    .padding(.horizontal, 6).padding(.vertical, 1)
                    .background(Theme.line).foregroundStyle(Theme.ghost)
                    .themedClip()
            }
            if queue.urgentCount > 0 {
                Text("\(queue.urgentCount) urgent")
                    .font(Theme.font(.caption2, weight: .bold))
                    .fixedSize()
                    .padding(.horizontal, 6).padding(.vertical, 1)
                    .background(Theme.accent.opacity(0.1)).foregroundStyle(Theme.accent)
                    .themedClip()
            }
        }
    }

    private var sortMenu: some View {
        Menu {
            Picker("Sort", selection: $sort) {
                ForEach(QueueStore.Sort.allCases) { Text($0.label).tag($0) }
            }
        } label: {
            Image(systemName: "arrow.up.arrow.down")
        }
        .accessibilityLabel("Sort: \(sort.label)")
    }

    private var emptyBelt: some View {
        VStack(spacing: 10) {
            Image(systemName: "tray").font(.system(size: 30)).foregroundStyle(Theme.ghost)
            Text("Belt is clear").font(Theme.font(.subheadline, weight: .medium)).foregroundStyle(Theme.dim)
            Text("Capture bugs, blockers, quick decisions.\nItems older than 24h auto-archive below.")
                .font(Theme.font(.caption)).foregroundStyle(Theme.ghost).multilineTextAlignment(.center)
            Button("+ Add first item") { isAdding = true }
                .font(Theme.font(.subheadline, weight: .medium))
                .foregroundStyle(Theme.accent)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(Theme.accent.opacity(0.1))
                .themedClip(.card)
                .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
    }

    /// Web StaleSection: entries older than 24h, collapsed.
    private var staleSection: some View {
        Section {
            if showStale {
                ForEach(queue.stale) { item in
                    StaleRow(item: item) { editing = item }
                        .listRowBackground(Theme.canvas)
                        .listRowSeparatorTint(Theme.line)
                }
            }
        } header: {
            Button { withAnimation { showStale.toggle() } } label: {
                HStack {
                    Text("\(showStale ? "↑" : "↓") Yesterday · \(queue.stale.count) item\(queue.stale.count == 1 ? "" : "s")")
                    Spacer()
                    Text("auto-archived").foregroundStyle(Theme.ghost.opacity(0.7))
                }
                .font(Theme.font(.caption, weight: .medium))
                .foregroundStyle(Theme.ghost)
            }
            .buttonStyle(.plain)
            .textCase(nil)
        }
    }

    private var historySection: some View {
        Section {
            if showHistory {
                if queue.history.isEmpty {
                    Text("Nothing marked done yet").font(Theme.font(.caption)).foregroundStyle(Theme.ghost)
                        .listRowBackground(Theme.canvas)
                }
                ForEach(queue.history) { item in
                    HStack(spacing: 8) {
                        Text("✓").foregroundStyle(Color.green.opacity(0.7))
                        Text(item.title).strikethrough().foregroundStyle(Theme.ghost)
                        Spacer()
                        if let done = item.completedAt {
                            Text(done.formatted(.dateTime.day().month(.abbreviated))).foregroundStyle(Theme.ghost.opacity(0.7))
                        }
                    }
                    .font(Theme.font(.caption))
                    .listRowBackground(Theme.canvas)
                }
            }
        } header: {
            Button {
                withAnimation { showHistory.toggle() }
                if showHistory { Task { await queue.loadHistory() } }
            } label: {
                HStack {
                    Text("Done history\(queue.history.isEmpty ? "" : " (\(queue.history.count))")".uppercased())
                    Spacer()
                    Text(showHistory ? "↑" : "↓")
                }
                .font(Theme.font(.caption2, weight: .semibold))
                .foregroundStyle(Theme.ghost)
            }
            .buttonStyle(.plain)
            .textCase(nil)
        }
    }
}

/// One belt entry (web BeltItem): rail, position number, NEXT UP, title, meta, age bar.
private struct BeltRow: View {
    let item: QueueItem
    let index: Int
    let total: Int

    /// Web railClass: the front of the belt is solid accent, fading towards the back.
    private var railColor: Color {
        let pct = total <= 1 ? 0 : Double(index) / Double(total - 1)
        if pct < 0.25 { return Theme.accent }
        if pct < 0.5 { return Theme.accent.opacity(0.5) }
        if pct < 0.75 { return Theme.accent.opacity(0.2) }
        return Theme.line
    }

    var body: some View {
        let priority = PriorityStyle.of(item.priority)
        HStack(alignment: .top, spacing: 0) {
            Rectangle().fill(railColor).frame(width: 4)
            Text(String(format: "%02d", index + 1))
                .font(Theme.code(.caption2))
                .foregroundStyle(Theme.ghost.opacity(0.6))
                .frame(width: 30)
                .padding(.top, 14)
            VStack(alignment: .leading, spacing: 6) {
                if index == 0 {
                    Text("NEXT UP")
                        .font(Theme.font(.caption2, weight: .bold))
                        .tracking(1.5)
                        .foregroundStyle(Theme.accent)
                }
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if item.isOverdue { OverdueDot() }
                    Text(item.title).font(Theme.font(.subheadline)).foregroundStyle(Theme.ink)
                }
                HStack(spacing: 8) {
                    Text(priority.label).font(Theme.font(.caption, weight: .bold)).foregroundStyle(priority.color)
                    if let estimate = item.estimateMinutes {
                        Text(Format.estimate(estimate)).font(Theme.font(.caption, weight: .medium)).foregroundStyle(Theme.dim)
                    }
                    if let text = item.deadlineText {
                        Text(text)
                            .font(Theme.font(.caption, weight: item.isOverdue ? .bold : .medium))
                            .foregroundStyle(item.isOverdue ? Color.red : Theme.dim)
                    }
                }
                // Web AgeBar: only once 75% of the 24h window is gone (amber, then red from 90%).
                if item.ageFraction >= 0.75 {
                    ProgressLine(progress: Int(item.ageFraction * 100),
                                 color: item.ageFraction >= 0.9 ? .red : Color(hex: "#fb923c"),
                                 height: 2)
                }
            }
            .padding(.vertical, 12)
            .padding(.trailing, 16)
            Spacer(minLength: 0)
        }
    }
}

/// Red dot for a missed deadline (also counted in the Queue tab badge).
struct OverdueDot: View {
    var body: some View {
        Circle().fill(Color.red).frame(width: 8, height: 8)
            .accessibilityLabel("Deadline missed")
    }
}

/// Web StaleSection row: Revive / Convert / ×.
private struct StaleRow: View {
    @Environment(QueueStore.self) private var queue
    let item: QueueItem
    let onConvert: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                if item.isOverdue { OverdueDot() }
                Text(item.title).font(Theme.font(.footnote)).foregroundStyle(Theme.dim).lineLimit(1)
            }
            Text(relativeAge).font(Theme.font(.caption2)).foregroundStyle(Theme.ghost)
            HStack(spacing: 8) {
                Button("↩ Revive") { Task { await queue.revive(item.id) } }
                Button("→ Convert", action: onConvert)
                Spacer()
                Button { Task { await queue.archive(item.id) } } label: { Image(systemName: "xmark") }
                    .accessibilityLabel("Dismiss")
            }
            .font(Theme.font(.caption2, weight: .medium))
            .foregroundStyle(Theme.dim)
            .buttonStyle(.bordered)
        }
        .opacity(0.75)
        .padding(.vertical, 4)
    }

    private var relativeAge: String {
        let hours = Int(Date.now.timeIntervalSince(item.createdAt) / 3600)
        return hours < 24 ? "\(hours)h ago" : "\(hours / 24)d ago"
    }
}
