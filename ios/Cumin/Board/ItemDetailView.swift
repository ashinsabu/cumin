import SwiftUI

/// Port of ui/src/components/ItemModal.tsx: view and edit one item.
/// Status changes apply immediately (like the web); other fields save with the Save button.
struct ItemDetailView: View {
    @Environment(BoardStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    let itemID: String

    @State private var title = ""
    @State private var epicID: String?
    @State private var priority = 4
    @State private var estimateRaw = ""
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var confirmDelete = false
    @State private var loaded = false

    /// Live item from the store, so status moves and background syncs show up here.
    private var item: Item? { store.items.first { $0.id == itemID } }

    private var parsedEstimate: Int? { Format.parseEstimate(estimateRaw) }
    private var estimateInvalid: Bool { !estimateRaw.trimmingCharacters(in: .whitespaces).isEmpty && parsedEstimate == nil }

    private var isDirty: Bool {
        guard let item else { return false }
        let estimate = estimateRaw.trimmingCharacters(in: .whitespaces).isEmpty ? nil : parsedEstimate
        return title != item.title || epicID != item.epicId || priority != item.priority || estimate != item.estimateMinutes
    }

    var body: some View {
        NavigationStack {
            Group {
                if let item {
                    form(for: item)
                } else {
                    ContentUnavailableView("Item not found", systemImage: "questionmark.square.dashed")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.canvas)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .principal) {
                    if let item {
                        HStack(spacing: 6) {
                            PriorityBadge(priority: item.priority)
                            Text(item.displayId).font(Theme.mono(.subheadline, weight: .medium)).foregroundStyle(Theme.dim)
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isDirty {
                        Button(isSaving ? "Saving…" : "Save") { Task { await save() } }
                            .disabled(isSaving || title.trimmingCharacters(in: .whitespaces).isEmpty || estimateInvalid)
                    }
                }
            }
            .onAppear(perform: loadFields)
        }
        .tint(Theme.accent)
    }

    private func form(for item: Item) -> some View {
        Form {
            Section {
                TextField("Item title", text: $title, axis: .vertical)
                    .font(Theme.mono(.headline, weight: .semibold))
                if let description = item.description, !description.isEmpty {
                    Text(description)
                        .font(Theme.mono(.subheadline))
                        .foregroundStyle(Theme.dim)
                }
            }

            Section("Status") {
                StatusPicker(statuses: store.statuses, selectedID: item.statusId) { status in
                    Task { await store.move(itemID: item.id, to: status.id) }
                }
            }

            Section("Details") {
                Picker("Epic", selection: $epicID) {
                    Text("None").tag(String?.none)
                    ForEach(store.epics) { epic in
                        Text(epic.name).tag(Optional(epic.id))
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Priority").font(.subheadline)
                    PriorityPicker(priority: $priority)
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Estimate")
                        Spacer()
                        TextField("e.g. 2h, 30m, 2d", text: $estimateRaw)
                            .multilineTextAlignment(.trailing)
                            .font(Theme.mono(.body))
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .frame(maxWidth: 160)
                    }
                    if estimateInvalid {
                        Text("Use formats like 2h, 30m, 1h30m, 2d").font(.caption).foregroundStyle(.red)
                    } else if let minutes = parsedEstimate {
                        Text("= \(Format.estimate(minutes))").font(.caption).foregroundStyle(Theme.ghost)
                    }
                }
            }

            Section("Time in status") {
                StatusDurationBar(minutes: item.timeInStatusMinutes, estimateMinutes: item.estimateMinutes)
            }

            if let sprints = item.sprints, !sprints.isEmpty {
                Section("Sprints") {
                    Text(sprints.joined(separator: " · ")).font(Theme.mono(.caption)).foregroundStyle(Theme.dim)
                    Text(sprints.count > 1 ? "Spilled \(sprints.count - 1)×" : "No spillover")
                        .font(.caption).foregroundStyle(Theme.ghost)
                }
            }

            if let saveError {
                Section { Text(saveError).foregroundStyle(.red).font(.footnote) }
            }

            Section {
                Button("Delete item", role: .destructive) { confirmDelete = true }
            }
        }
        .confirmationDialog("Move \"\(item.title)\" to trash?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                Task { await store.delete(item.id) }
                dismiss()
            }
        } message: {
            Text("You can undo right after, or restore it later from Recently Deleted on the web.")
        }
    }

    private func loadFields() {
        guard !loaded, let item else { return }
        loaded = true
        title = item.title
        epicID = item.epicId
        priority = item.priority
        estimateRaw = item.estimateMinutes.map(Format.estimate) ?? ""
    }

    private func save() async {
        guard let item else { return }
        isSaving = true
        saveError = nil
        defer { isSaving = false }

        let estimate = estimateRaw.trimmingCharacters(in: .whitespaces).isEmpty ? nil : parsedEstimate
        do {
            try await store.update(item.id, .init(
                title: title.trimmingCharacters(in: .whitespaces),
                priority: priority,
                estimateMinutes: estimate,
                epicId: epicID,
                clearEpic: epicID == nil
            ))
            dismiss()
        } catch {
            saveError = error.localizedDescription
        }
    }
}

// MARK: - Shared form controls

struct PriorityBadge: View {
    let priority: Int

    var body: some View {
        let style = PriorityStyle.of(priority)
        Text(style.label)
            .font(Theme.mono(.caption, weight: .heavy))
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(style.bg)
            .foregroundStyle(style.color)
    }
}

/// P0–P4 buttons; same picker colours as the web modals.
struct PriorityPicker: View {
    @Binding var priority: Int
    private static let colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#6b7280"]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<5, id: \.self) { p in
                let color = Color(hex: Self.colors[p])
                let selected = p == priority
                Button { priority = p } label: {
                    Text("P\(p)")
                        .font(Theme.mono(.caption, weight: .bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .foregroundStyle(selected ? color : Theme.dim)
                        .background(selected ? color.opacity(0.12) : .clear)
                        .overlay(Rectangle().stroke(selected ? color : Theme.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// One chip per status; tapping moves the item immediately.
private struct StatusPicker: View {
    let statuses: [Status]
    let selectedID: String
    let onSelect: (Status) -> Void

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                ForEach(statuses) { status in
                    let selected = status.id == selectedID
                    let color = status.isDone ? Color(hex: "#34d399") : Theme.accent
                    Button { if !selected { onSelect(status) } } label: {
                        Text(status.name)
                            .font(Theme.mono(.caption, weight: .semibold))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .foregroundStyle(selected ? color : Theme.dim)
                            .background(selected ? color.opacity(0.12) : Theme.line)
                            .overlay(Rectangle().stroke(selected ? color.opacity(0.3) : .clear, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .scrollIndicators(.hidden)
    }
}
