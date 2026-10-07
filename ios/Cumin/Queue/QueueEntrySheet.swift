import SwiftUI

/// Add a queue entry (web NewItemForm) or edit one (web ExpandedEditor + ConvertSheet).
struct QueueEntrySheet: View {
    enum Mode {
        case add
        case edit(QueueItem)
    }

    @Environment(QueueStore.self) private var queue
    @Environment(BoardStore.self) private var board
    @Environment(\.dismiss) private var dismiss

    let mode: Mode

    private static let quickEstimates = ["15m", "30m", "1h", "2h"]

    @State private var title = ""
    @State private var priority = 2
    @State private var estimateRaw = ""
    @State private var hasDeadline = false
    @State private var deadline = Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now
    @State private var notes = ""
    @State private var isSaving = false
    @State private var error: String?
    @State private var converting = false
    @State private var projectID: String?
    @State private var epicID: String?
    @State private var convertedAs: String?
    @State private var loaded = false
    @FocusState private var titleFocused: Bool

    private var editingItem: QueueItem? {
        if case .edit(let item) = mode { return item }
        return nil
    }

    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespaces) }
    private var estimateMinutes: Int? { Format.parseEstimate(estimateRaw) }
    private var estimateInvalid: Bool { !estimateRaw.trimmingCharacters(in: .whitespaces).isEmpty && estimateMinutes == nil }

    private var draft: QueueStore.Draft {
        .init(title: trimmedTitle, notes: notes,
              deadline: hasDeadline ? Deadline.string(from: deadline) : nil,
              priority: priority, estimateMinutes: estimateMinutes)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("Cancel") { dismiss() }.foregroundStyle(Theme.dim)
                Spacer()
                Text(editingItem == nil ? "Add to queue" : "Queue item")
                    .font(Theme.font(.headline, weight: .semibold)).foregroundStyle(Theme.ink)
                Spacer()
                Button(isSaving ? "…" : (editingItem == nil ? "Add" : "Done")) { Task { await save() } }
                    .fontWeight(.semibold)
                    .foregroundStyle(trimmedTitle.isEmpty || estimateInvalid ? Theme.ghost : Theme.accent)
                    .disabled(isSaving || trimmedTitle.isEmpty || estimateInvalid)
                    .accessibilityIdentifier("queue-save")
            }
            .font(Theme.font(.subheadline))
            .buttonStyle(.plain)
            .padding(20)

            Divider().overlay(Theme.line)

            if let convertedAs {
                Text("Converted as \(convertedAs)")
                    .font(Theme.font(.subheadline)).italic().foregroundStyle(Theme.dim)
                    .frame(maxWidth: .infinity, minHeight: 120)
            } else {
                ScrollView { form.padding(20) }
                    .scrollDismissesKeyboard(.interactively)
            }
        }
        .background(Theme.raised)
        .presentationBackground(Theme.sheetBackground)
        .tint(Theme.accent)
        .onAppear(perform: loadFields)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 18) {
            TextField("What needs attention?", text: $title, axis: .vertical)
                .textFieldStyle(BoxedTextFieldStyle())
                .focused($titleFocused)
                .accessibilityIdentifier("queue-title")

            FormField(label: "Priority") { PriorityPicker(priority: $priority) }

            FormField(label: "Estimate") {
                HStack(spacing: 6) {
                    ForEach(Self.quickEstimates, id: \.self) { value in
                        let selected = estimateRaw == value
                        Button(value) { estimateRaw = selected ? "" : value }
                            .font(Theme.font(.caption, weight: .medium))
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .foregroundStyle(selected ? Theme.accent : Theme.dim)
                            .background(selected ? Theme.accent.opacity(0.1) : Theme.surface)
                            .themedBorder(selected ? Theme.accent : Theme.line)
                            .buttonStyle(.plain)
                    }
                    TextField("other", text: Binding(
                        get: { Self.quickEstimates.contains(estimateRaw) ? "" : estimateRaw },
                        set: { estimateRaw = $0 }
                    ))
                    .textFieldStyle(BoxedTextFieldStyle())
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .frame(maxWidth: 90)
                }
                if estimateInvalid {
                    Text("Use 15m, 2h, 1h30m, 1d").font(Theme.font(.caption2)).foregroundStyle(.red)
                }
            }

            FormField(label: "Deadline") {
                HStack {
                    Toggle(isOn: $hasDeadline.animation()) {
                        HStack(spacing: 6) {
                            if let item = editingItem, item.isOverdue, hasDeadline { OverdueDot() }
                            Text(hasDeadline ? (deadlineLabel ?? "Set") : "None")
                                .font(Theme.font(.subheadline))
                                .foregroundStyle(editingItem?.isOverdue == true && hasDeadline ? Color.red : Theme.ink)
                        }
                    }
                }
                if hasDeadline {
                    DatePicker("Deadline", selection: $deadline, displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .labelsHidden()
                }
            }

            if editingItem != nil {
                FormField(label: "Notes") {
                    TextField("Notes…", text: $notes, axis: .vertical)
                        .lineLimit(2...6)
                        .accessibilityIdentifier("queue-notes")
                        .textFieldStyle(BoxedTextFieldStyle())
                }
                if converting { convertSection } else { editActions }
            }

            if let error {
                Text(error).font(Theme.font(.footnote)).foregroundStyle(.red)
            }
        }
    }

    private var deadlineLabel: String? {
        guard let item = editingItem, item.deadline != nil, hasDeadline else { return nil }
        return item.deadlineText
    }

    private var editActions: some View {
        HStack(spacing: 8) {
            Button("Convert ↗") {
                projectID = projectID ?? board.projects.first?.id
                converting = true
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .font(Theme.font(.footnote, weight: .medium))
            .foregroundStyle(Theme.accent)
            .background(Theme.accent.opacity(0.1))
            .themedClip(.card)
            .accessibilityIdentifier("queue-convert")

            Button("Remove") {
                if let item = editingItem { Task { await queue.archive(item.id) } }
                dismiss()
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .font(Theme.font(.footnote))
            .foregroundStyle(Theme.dim)
            .themedBorder(Theme.line)
        }
        .buttonStyle(.plain)
    }

    /// Web ConvertSheet: project + epic; status is the board's first column; priority & estimate carry over.
    private var convertSection: some View {
        let initial = board.statuses.first(where: \.isInitial) ?? board.statuses.first
        return VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Convert to item")
            Picker("Project", selection: $projectID) {
                ForEach(board.projects) { Text($0.name).tag(Optional($0.id)) }
            }
            Picker("Epic", selection: $epicID) {
                Text("No epic").tag(String?.none)
                ForEach(board.epics) { Text($0.name).tag(Optional($0.id)) }
            }
            if let initial {
                Text("Status: \(initial.name) · Priority & estimate carried over")
                    .font(Theme.font(.caption)).foregroundStyle(Theme.ghost)
            }
            HStack(spacing: 8) {
                Button("Cancel") { converting = false }
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .foregroundStyle(Theme.dim).themedBorder(Theme.line)
                Button(isSaving ? "…" : "Create item ↗") { Task { await convert(statusID: initial?.id) } }
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .foregroundStyle(.white).background(Theme.accent).themedClip(.card)
                    .disabled(isSaving || projectID == nil || initial == nil)
                    .accessibilityIdentifier("queue-create-item")
            }
            .font(Theme.font(.footnote, weight: .medium))
            .buttonStyle(.plain)
        }
        .font(Theme.font(.subheadline))
    }

    private func loadFields() {
        guard !loaded else { return }
        loaded = true
        guard let item = editingItem else {
            titleFocused = true
            return
        }
        title = item.title
        priority = item.priority
        estimateRaw = item.estimateMinutes.map(Format.estimate) ?? ""
        notes = item.notes
        if let d = item.deadline {
            hasDeadline = true
            // Stored as midnight UTC of the chosen day; show that calendar day.
            var utc = Calendar(identifier: .gregorian)
            utc.timeZone = TimeZone(identifier: "UTC")!
            let c = utc.dateComponents([.year, .month, .day], from: d)
            deadline = Calendar.current.date(from: c) ?? d
        }
    }

    private func save() async {
        isSaving = true
        error = nil
        defer { isSaving = false }
        do {
            if let item = editingItem {
                // Web saves only when something changed.
                if draft != QueueStore.Draft(
                    title: item.title, notes: item.notes,
                    deadline: item.deadline.map(Deadline.string(fromUTCDay:)),
                    priority: item.priority, estimateMinutes: item.estimateMinutes
                ) {
                    try await queue.update(item.id, draft)
                }
            } else {
                try await queue.create(draft)
            }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func convert(statusID: String?) async {
        guard let item = editingItem, let projectID, let statusID else { return }
        isSaving = true
        error = nil
        defer { isSaving = false }
        do {
            // Save pending edits first so the new board item gets them.
            if draft.title != item.title || draft.priority != item.priority || draft.estimateMinutes != item.estimateMinutes {
                try await queue.update(item.id, draft)
            }
            let result = try await queue.promote(item.id, projectID: projectID, statusID: statusID, epicID: epicID)
            convertedAs = result.itemDisplayId
            await board.load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension Deadline {
    /// The server's deadline Date (midnight UTC) back to the same "YYYY-MM-DDT00:00:00Z" string.
    static func string(fromUTCDay date: Date) -> String {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let c = utc.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02dT00:00:00Z", c.year ?? 2000, c.month ?? 1, c.day ?? 1)
    }
}
