import SwiftUI

/// Port of ui/src/components/ItemCard.tsx.
struct ItemCard: View {
    let item: Item

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
                PriorityBadge(priority: item.priority)
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

            StatusDurationBar(minutes: item.timeInStatusMinutes, estimateMinutes: item.estimateMinutes)

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

/// Port of ui/src/components/StatusDurationBar.tsx.
/// With an estimate: fill = time in status / estimate (green < 50%, yellow < 80%, orange < 100%, red after).
/// Without one: scaled against an 8h day.
struct StatusDurationBar: View {
    let minutes: Int?
    var estimateMinutes: Int? = nil

    var body: some View {
        if let minutes {
            let (color, fraction) = Self.style(minutes: minutes, estimate: estimateMinutes)
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
                    .foregroundStyle(minutes == 0 ? Theme.ghost : color)
            }
        } else {
            Text("—").font(.caption).foregroundStyle(Theme.ghost)
        }
    }

    private static let green = Color(hex: "#22c55e")
    private static let yellow = Color(hex: "#eab308")
    private static let orange = Color(hex: "#f97316")
    private static let red = Color(hex: "#dc2626")

    static func style(minutes: Int, estimate: Int?) -> (Color, Double) {
        if let estimate, estimate > 0 {
            let ratio = Double(minutes) / Double(estimate)
            let color = ratio >= 1 ? red : ratio >= 0.8 ? orange : ratio >= 0.5 ? yellow : green
            return (color, min(ratio, 1))
        }
        let hours = Double(minutes) / 60
        if hours > 24 { return (red, 1) }
        if hours > 8 { return (orange, min(0.5 + (hours - 8) / 16 * 0.5, 1)) }
        if hours > 2 { return (yellow, min(0.25 + (hours - 2) / 6 * 0.25, 0.5)) }
        return (green, minutes == 0 ? 0 : max(hours / 2 * 0.25, 0.03))
    }
}
