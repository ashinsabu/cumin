import SwiftUI

/// Port of ui/src/components/ItemCard.tsx.
struct ItemCard: View {
    let item: Item

    private var priority: PriorityStyle { .of(item.priority) }
    private var spillCount: Int { max((item.sprints?.count ?? 0) - 1, 0) }
    private var epicColor: Color? { item.epicColor.map(Color.init(hex:)) }

    private var isOverdue: Bool {
        guard let deadline = item.deadline, let date = Self.dayFormatter.date(from: String(deadline.prefix(10))) else {
            return false
        }
        return date < .now
    }

    /// Left border colour shows how many sprints the item has spilled over.
    private var spillColor: Color {
        switch spillCount {
        case 3...: .red
        case 2: Color(hex: "#fbbf24")
        case 1: .gray
        default: .clear
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Text(priority.label)
                    .font(Theme.mono(.caption, weight: .heavy))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(priority.bg)
                    .foregroundStyle(priority.color)
                Text(item.title)
                    .font(Theme.mono(.subheadline, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if item.epicName != nil || isOverdue {
                HStack(spacing: 6) {
                    if let name = item.epicName, let color = epicColor {
                        Text(name.uppercased())
                            .font(Theme.mono(.caption2, weight: .semibold))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .foregroundStyle(color)
                            .background(color.opacity(0.10))
                            .overlay(Rectangle().stroke(color.opacity(0.19), lineWidth: 1))
                    }
                    if isOverdue, let deadline = item.deadline {
                        Text("⚠ \(deadline)")
                            .font(Theme.mono(.caption2, weight: .medium))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .foregroundStyle(Color(hex: "#f87171"))
                            .background(Color.red.opacity(0.10))
                    }
                }
            }

            StatusDurationBar(minutes: item.timeInStatusMinutes)

            HStack {
                if let estimate = item.estimateMinutes {
                    Text(Format.estimate(estimate))
                        .font(Theme.mono(.caption, weight: .semibold))
                        .foregroundStyle(Theme.ink.opacity(0.8))
                }
                if spillCount > 0 {
                    Text("↻\(spillCount)")
                        .font(Theme.mono(.caption2, weight: .medium))
                        .padding(.horizontal, 4)
                        .foregroundStyle(spillCount >= 2 ? spillColor : Theme.dim)
                        .background(spillColor.opacity(0.12))
                }
                Spacer()
                Text(item.displayId)
                    .font(Theme.mono(.caption, weight: .medium))
                    .foregroundStyle(Theme.dim)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .background(epicColor?.opacity(0.10) ?? .clear)
        .overlay(Rectangle().stroke(epicColor?.opacity(0.21) ?? Theme.line, lineWidth: 1))
        .overlay(alignment: .leading) {
            Rectangle().fill(spillColor).frame(width: 3)
        }
        .contentShape(Rectangle())
    }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
}

/// Port of ui/src/components/StatusDurationBar.tsx: green < 1d, yellow < 3d, orange < 7d, red after.
struct StatusDurationBar: View {
    let minutes: Int?

    var body: some View {
        if let minutes {
            let days = Double(minutes) / 1440
            let (color, fraction) = Self.style(days: days)
            HStack(spacing: 8) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.line)
                        Capsule().fill(color).frame(width: geo.size.width * fraction)
                    }
                }
                .frame(height: 6)
                Text(Format.duration(minutes))
                    .font(Theme.mono(.footnote, weight: .bold))
                    .foregroundStyle(color)
            }
        } else {
            Text("—").font(.caption).foregroundStyle(Theme.ghost)
        }
    }

    private static func style(days: Double) -> (Color, Double) {
        if days > 7 { return (Color(hex: "#dc2626"), 1) }
        if days > 3 { return (Color(hex: "#f97316"), min(days * 0.12, 1)) }
        if days > 1 { return (Color(hex: "#eab308"), min(days * 0.20, 1)) }
        return (Color(hex: "#22c55e"), max(days * 0.30, 0.08))
    }
}
