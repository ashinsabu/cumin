import SwiftUI

/// Port of ui/src/views/DashboardView.tsx: 80/20 capacity, sprint health, epic progress, stale items.
struct DashboardView: View {
    @Environment(BoardStore.self) private var store

    private var doneIDs: Set<String> { Set(store.statuses.filter(\.isDone).map(\.id)) }

    var body: some View {
        ScrollView {
            if let board = store.board {
                VStack(alignment: .leading, spacing: 24) {
                    capacity(board)
                    health
                    epicProgress
                    staleItems
                    suggested
                }
                .padding(16)
            } else if store.hasLoaded {
                ContentUnavailableView("Board unavailable", systemImage: "exclamationmark.triangle")
            } else {
                ProgressView().frame(maxWidth: .infinity, minHeight: 200)
            }
        }
        .background(Theme.canvas)
        .refreshable { await store.load() }
        .navigationTitle("Dashboard")
        .navigationBarTitleDisplayMode(.inline)
        .task { if !store.hasLoaded { await store.load() } }
    }

    // MARK: Sections

    /// Planned estimate vs 80% of the board's available hours; the last 20% is buffer.
    private func capacity(_ board: Board) -> some View {
        let planned = store.items.reduce(0) { $0 + ($1.estimateMinutes ?? 0) }
        let available = Double(board.availableHoursPerSprint * 60)
        let target = available * 0.8
        let used = target > 0 ? Int((Double(planned) / target * 100).rounded()) : 0
        let bufferLeft = max(0, available * 0.2 - max(0, Double(planned) - target))
        let color = used > 100 ? Color(hex: "#dc2626") : used > 80 ? Color(hex: "#f59e0b") : Color(hex: "#22c55e")

        return section("Sprint Capacity (80/20)") {
            card {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Planned vs Target (80%)").font(Theme.mono(.footnote, weight: .medium)).foregroundStyle(Theme.dim)
                        Spacer()
                        Text("\(used)%").font(Theme.mono(.footnote, weight: .bold)).foregroundStyle(color)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.line)
                            Capsule().fill(color).frame(width: geo.size.width * min(CGFloat(used), 100) / 100)
                            Rectangle().fill(Theme.ghost).frame(width: 2).offset(x: geo.size.width * 0.8)
                        }
                    }
                    .frame(height: 10)
                    HStack(alignment: .top) {
                        Text("\(Format.estimate(planned)) planned of \(Format.estimate(Int(target))) target")
                            .foregroundStyle(Theme.ghost)
                        Spacer()
                        Text("Buffer: \(Format.estimate(Int(bufferLeft))) left")
                            .foregroundStyle(Double(planned) > target ? Color(hex: "#f59e0b") : Theme.ghost)
                    }
                    .font(Theme.mono(.caption2))
                }
            }
        }
    }

    private var health: some View {
        let total = store.items.count
        let done = store.items.filter { doneIDs.contains($0.statusId) }
        let spilled = store.items.filter { ($0.sprints?.count ?? 0) > 1 }.count
        let planned = store.items.reduce(0) { $0 + ($1.estimateMinutes ?? 0) }
        let doneMinutes = done.reduce(0) { $0 + ($1.estimateMinutes ?? 0) }
        func pct(_ a: Int, _ b: Int) -> Int { b > 0 ? Int((Double(a) / Double(b) * 100).rounded()) : 0 }

        return section("Sprint Health") {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                StatCard(label: "Completion", value: "\(pct(done.count, total))%", sub: "\(done.count)/\(total) items")
                StatCard(label: "Spillover Rate", value: "\(pct(spilled, total))%", sub: "\(spilled) items spilled")
                StatCard(label: "Hours Planned", value: Format.estimate(planned), sub: "this sprint")
                StatCard(label: "Hours Done", value: Format.estimate(doneMinutes), sub: "\(pct(doneMinutes, planned))% of planned")
            }
        }
    }

    private var epicProgress: some View {
        section("Epic Progress") {
            VStack(spacing: 8) {
                ForEach(store.epics) { epic in
                    let stats = store.stats(for: epic)
                    let color = Color(hex: epic.color)
                    card {
                        HStack(spacing: 10) {
                            Circle().fill(color).frame(width: 10, height: 10)
                            Text(epic.name)
                                .font(Theme.mono(.footnote, weight: .medium))
                                .foregroundStyle(Theme.ink.opacity(0.8))
                                .lineLimit(1)
                                .frame(width: 96, alignment: .leading)
                            ProgressLine(progress: stats.progress, color: color, height: 7)
                            Text("\(stats.progress)%")
                                .font(Theme.mono(.caption, weight: .semibold))
                                .foregroundStyle(Theme.dim)
                                .frame(width: 38, alignment: .trailing)
                            if let days = stats.daysLeft {
                                Text(days > 0 ? "\(days)d" : "Overdue")
                                    .font(Theme.mono(.caption2, weight: days < 7 ? .medium : .regular))
                                    .foregroundStyle(days < 7 ? .red : Theme.ghost)
                            }
                        }
                    }
                }
                if store.epics.isEmpty { empty("No epics yet.") }
            }
        }
    }

    /// Items not done that have sat in their status for more than 2 days.
    private var staleItems: some View {
        let stale = store.items.filter { ($0.timeInStatusMinutes ?? 0) > 2_880 && !doneIDs.contains($0.statusId) }
        return section("Stale Items (>2 days in status)") {
            VStack(spacing: 8) {
                ForEach(stale) { item in
                    card {
                        HStack(spacing: 10) {
                            Text(item.displayId).font(Theme.mono(.caption, weight: .medium)).foregroundStyle(Theme.dim)
                            Text(item.title).font(Theme.mono(.footnote, weight: .medium)).foregroundStyle(Theme.ink.opacity(0.8)).lineLimit(1)
                            Spacer(minLength: 8)
                            StatusDurationBar(minutes: item.timeInStatusMinutes, estimateMinutes: item.estimateMinutes)
                                .frame(width: 110)
                        }
                    }
                }
                if stale.isEmpty { empty("Nothing stale.") }
            }
        }
    }

    /// Placeholders on the web too (not clickable yet).
    private var suggested: some View {
        let ideas = [
            ("📈", "Weekly Velocity", "Hours completed per sprint over time. Spot trends in your output."),
            ("🎯", "Estimate Accuracy", "Planned vs actual. Are you overestimating or underestimating?"),
            ("🔮", "Focus Distribution", "Time split across epics. Where is your energy actually going?"),
            ("🔥", "Spillover Heatmap", "Which items/epics spill most? Identify chronic blockers."),
        ]
        return section("Suggested Dashboards") {
            VStack(spacing: 8) {
                ForEach(ideas, id: \.1) { icon, name, desc in
                    card {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(icon) \(name)").font(Theme.mono(.footnote, weight: .semibold)).foregroundStyle(Theme.ink.opacity(0.8))
                            Text(desc).font(Theme.mono(.caption2)).foregroundStyle(Theme.ghost)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }

    // MARK: Building blocks

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(Theme.mono(.footnote, weight: .semibold)).foregroundStyle(Theme.ink.opacity(0.8))
            content()
        }
    }

    private func card(@ViewBuilder content: () -> some View) -> some View {
        content()
            .padding(14)
            .background(Theme.surface)
            .overlay(Rectangle().stroke(Theme.line, lineWidth: 1))
    }

    private func empty(_ text: String) -> some View {
        Text(text).font(Theme.mono(.caption)).foregroundStyle(Theme.ghost).frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Port of ui/src/components/StatCard.tsx.
private struct StatCard: View {
    let label: String
    let value: String
    let sub: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased()).font(Theme.mono(.caption2, weight: .medium)).tracking(0.5).foregroundStyle(Theme.ghost)
            Text(value).font(Theme.mono(.title2, weight: .bold)).foregroundStyle(Theme.ink)
            Text(sub).font(Theme.mono(.caption2)).foregroundStyle(Theme.ghost)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.surface)
        .overlay(Rectangle().stroke(Theme.line, lineWidth: 1))
    }
}
