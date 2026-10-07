import SwiftUI

/// Per-epic numbers shown in the list and the detail sheet (same maths as the web EpicsView).
struct EpicStats {
    let epic: Epic
    let items: [Item]
    let doneCount: Int
    let totalEstimate: Int
    /// Done estimate / total estimate, 0–100.
    let progress: Int
    let daysLeft: Int?
}

extension BoardStore {
    func stats(for epic: Epic) -> EpicStats {
        let doneIDs = Set(statuses.filter(\.isDone).map(\.id))
        let epicItems = items.filter { $0.epicId == epic.id }
        let done = epicItems.filter { doneIDs.contains($0.statusId) }
        let total = epicItems.reduce(0) { $0 + ($1.estimateMinutes ?? 0) }
        let doneEstimate = done.reduce(0) { $0 + ($1.estimateMinutes ?? 0) }
        let daysLeft = epic.deadline.flatMap(Deadline.date(from:)).map {
            Int(ceil($0.timeIntervalSinceNow / 86_400))
        }
        return EpicStats(
            epic: epic,
            items: epicItems,
            doneCount: done.count,
            totalEstimate: total,
            progress: total > 0 ? Int((Double(doneEstimate) / Double(total) * 100).rounded()) : 0,
            daysLeft: daysLeft
        )
    }
}

enum Deadline {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func date(from raw: String) -> Date? { iso.date(from: raw) }

    /// Midnight UTC of the picked day, as the web sends it.
    static func string(from date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02dT00:00:00Z", c.year ?? 2000, c.month ?? 1, c.day ?? 1)
    }
}

/// GOAL / RECURRING / CATCHALL pill.
struct EpicTypeBadge: View {
    let type: String

    var body: some View {
        let color: Color = switch type {
        case "recurring": Color(hex: "#4ade80")
        case "goal": Color(hex: "#c084fc")
        default: Theme.dim
        }
        Text(type.uppercased())
            .font(Theme.mono(.caption2, weight: .semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .foregroundStyle(color)
            .background(type == "catchall" ? Theme.line : color.opacity(0.1))
            .overlay(Rectangle().stroke(type == "catchall" ? Theme.line : color.opacity(0.2), lineWidth: 1))
    }
}

/// "12d left" / "Overdue" / "—".
struct DeadlineChip: View {
    let daysLeft: Int?

    var body: some View {
        if let daysLeft {
            Text(daysLeft <= 0 ? "Overdue" : "\(daysLeft)d left")
                .font(Theme.mono(.caption, weight: .medium))
                .foregroundStyle(daysLeft <= 0 ? .red : daysLeft < 7 ? Color(hex: "#f59e0b") : Theme.ink.opacity(0.8))
        } else {
            Text("—").font(Theme.mono(.caption)).foregroundStyle(Theme.ghost)
        }
    }
}

struct ProgressLine: View {
    let progress: Int
    let color: Color
    var height: CGFloat = 5

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.line)
                Capsule().fill(color).frame(width: geo.size.width * CGFloat(progress) / 100)
            }
        }
        .frame(height: height)
    }
}

/// Row of preset colour dots (web CreateEpicModal / ProjectsView).
struct ColorSwatchPicker: View {
    let colors: [String]
    @Binding var selection: String

    var body: some View {
        // Wraps onto more lines rather than widening the sheet.
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 30, maximum: 36), spacing: 10)], alignment: .leading, spacing: 12) {
            ForEach(colors, id: \.self) { hex in
                let selected = hex == selection
                Circle()
                    .fill(Color(hex: hex))
                    .frame(width: 24, height: 24)
                    .overlay(Circle().stroke(Color(hex: hex), lineWidth: selected ? 2 : 0).padding(-4))
                    .scaleEffect(selected ? 1.1 : 1)
                    .onTapGesture { selection = hex }
                    .accessibilityLabel(hex)
                    .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(4)
    }
}

/// Label above a control, used by the flat create forms.
struct FormField<Content: View>: View {
    let label: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(Theme.mono(.caption, weight: .semibold))
                .foregroundStyle(Theme.dim)
            content
        }
    }
}

/// Bordered text input matching the item sheet's estimate box.
struct BoxedTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(Theme.mono(.subheadline))
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .background(Theme.surface)
            .overlay(Rectangle().stroke(Theme.line, lineWidth: 1))
    }
}
