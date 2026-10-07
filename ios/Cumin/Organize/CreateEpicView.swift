import SwiftUI

/// Port of ui/src/components/CreateEpicModal.tsx.
struct CreateEpicView: View {
    @Environment(BoardStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    static let colors = [
        "#6366f1", "#8b5cf6", "#ec4899", "#e11d48", "#f97316", "#eab308",
        "#22c55e", "#14b8a6", "#3b82f6", "#06b6d4", "#6b7280", "#a16207",
    ]
    private static let types = [("goal", "Goal"), ("recurring", "Recurring"), ("catchall", "Catch-all")]

    @State private var name = ""
    @State private var type = "goal"
    @State private var color = CreateEpicView.colors[0]
    @State private var description = ""
    @State private var hasDeadline = false
    @State private var deadline = Calendar.current.date(byAdding: .day, value: 14, to: .now) ?? .now
    @State private var isSaving = false
    @State private var error: String?
    @FocusState private var nameFocused: Bool

    private var trimmedName: String { name.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("Cancel") { dismiss() }.foregroundStyle(Theme.dim)
                Spacer()
                Text("New Epic").font(Theme.mono(.headline, weight: .semibold)).foregroundStyle(Theme.ink)
                Spacer()
                Button(isSaving ? "Creating…" : "Create") { Task { await submit() } }
                    .fontWeight(.semibold)
                    .foregroundStyle(trimmedName.isEmpty ? Theme.ghost : Theme.accent)
                    .disabled(isSaving || trimmedName.isEmpty)
                    .accessibilityIdentifier("create-epic")
            }
            .font(Theme.mono(.subheadline))
            .buttonStyle(.plain)
            .padding(20)

            Divider().overlay(Theme.line)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    FormField(label: "Name *") {
                        TextField("Epic name", text: $name)
                            .textFieldStyle(BoxedTextFieldStyle())
                            .focused($nameFocused)
                            .accessibilityIdentifier("epic-name")
                    }

                    FormField(label: "Type") {
                        HStack(spacing: 6) {
                            ForEach(Self.types, id: \.0) { value, label in
                                let selected = type == value
                                Button { type = value } label: {
                                    Text(label)
                                        .font(Theme.mono(.caption, weight: .medium))
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 8)
                                        .foregroundStyle(selected ? .white : Theme.dim)
                                        .background(selected ? Theme.accent : Theme.surface)
                                        .overlay(Rectangle().stroke(selected ? Theme.accent : Theme.line, lineWidth: 1))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    FormField(label: "Color") {
                        ColorSwatchPicker(colors: Self.colors, selection: $color)
                    }

                    FormField(label: "Description") {
                        TextField("Optional description…", text: $description, axis: .vertical)
                            .lineLimit(2...4)
                            .textFieldStyle(BoxedTextFieldStyle())
                    }

                    FormField(label: "Deadline") {
                        Toggle(isOn: $hasDeadline.animation()) {
                            Text(hasDeadline ? "Set" : "None").font(Theme.mono(.subheadline)).foregroundStyle(Theme.ink)
                        }
                        if hasDeadline {
                            DatePicker("Deadline", selection: $deadline, displayedComponents: .date)
                                .datePickerStyle(.compact)
                                .labelsHidden()
                        }
                    }

                    if let error {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                }
                .padding(20)
            }
        }
        .background(Theme.raised)
        .presentationBackground(Theme.raised)
        .tint(Theme.accent)
        .onAppear { nameFocused = true }
    }

    private func submit() async {
        isSaving = true
        error = nil
        defer { isSaving = false }
        let desc = description.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await store.createEpic(.init(
                name: trimmedName,
                type: type,
                color: color,
                description: desc.isEmpty ? nil : desc,
                deadline: hasDeadline ? Deadline.string(from: deadline) : nil
            ))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
