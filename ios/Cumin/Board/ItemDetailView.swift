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
        Group {
            if let item {
                content(for: item)
            } else {
                ContentUnavailableView("Item not found", systemImage: "questionmark.square.dashed")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.raised)
        .presentationBackground(Theme.raised)
        .tint(Theme.accent)
        .onAppear(perform: loadFields)
    }

    // Layout mirrors the web modal: header / label-value rows / footer, one flat surface.
    private func content(for item: Item) -> some View {
        VStack(spacing: 0) {
            header(for: item)
            Divider().overlay(Theme.line)

            ScrollView {
                VStack(spacing: 18) {
                    if let description = item.description, !description.isEmpty {
                        Text(description)
                            .font(Theme.mono(.footnote))
                            .foregroundStyle(Theme.dim)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    // Too many chips for a side-by-side row on a phone: label above, chips full width.
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Status")
                            .font(Theme.mono(.subheadline))
                            .foregroundStyle(Theme.dim)
                        StatusPicker(statuses: store.statuses, selectedID: item.statusId) { status in
                            Task { await store.move(itemID: item.id, to: status.id) }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    row("Epic") { epicMenu }
                    row("Priority") { PriorityPicker(priority: $priority).frame(maxWidth: 230) }
                    row("Estimate") { estimateField }
                    row("Time in status") {
                        StatusDurationBar(minutes: item.timeInStatusMinutes, estimateMinutes: item.estimateMinutes)
                            .frame(maxWidth: 180)
                    }
                    if let sprints = item.sprints, !sprints.isEmpty {
                        row("Sprints") {
                            Text(sprints.joined(separator: " · "))
                                .font(Theme.mono(.caption))
                                .foregroundStyle(Theme.dim)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 18)
            }
            .scrollDismissesKeyboard(.interactively)

            Divider().overlay(Theme.line)
            footer(for: item)
        }
    }

    private func header(for item: Item) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                PriorityBadge(priority: item.priority)
                Text(item.displayId)
                    .font(Theme.mono(.subheadline, weight: .medium))
                    .foregroundStyle(Theme.dim)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.dim)
                        .padding(6)
                }
                .buttonStyle(.plain)
            }
            TextField("Item title", text: $title, axis: .vertical)
                .font(Theme.mono(.title3, weight: .bold))
                .foregroundStyle(Theme.ink)
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 16)
    }

    private func footer(for item: Item) -> some View {
        HStack(spacing: 12) {
            if confirmDelete {
                Text("Move to trash?").foregroundStyle(Theme.dim)
                Spacer()
                Button("Cancel") { confirmDelete = false }
                    .foregroundStyle(Theme.dim)
                Button("Delete") {
                    Task { await store.delete(item.id) }
                    dismiss()
                }
                .fontWeight(.semibold)
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.red)
            } else {
                Button("Delete") { confirmDelete = true }
                    .foregroundStyle(Theme.dim)
                let spills = (item.sprints?.count ?? 0) - 1
                Text(spills > 0 ? "Spilled \(spills)×" : "No spillover")
                    .foregroundStyle(Theme.ghost)
                Spacer()
                if let saveError {
                    Text(saveError).foregroundStyle(.red).lineLimit(1)
                }
                if isDirty {
                    Button(isSaving ? "Saving…" : "Save") { Task { await save() } }
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(Theme.accent)
                        .disabled(isSaving || title.trimmingCharacters(in: .whitespaces).isEmpty || estimateInvalid)
                        .opacity(isSaving ? 0.5 : 1)
                }
            }
        }
        .font(Theme.mono(.footnote))
        .buttonStyle(.plain)
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Theme.panel)
    }

    /// Label on the left, control on the right (web `Row`).
    private func row(_ label: String, @ViewBuilder content: () -> some View) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text(label)
                .font(Theme.mono(.subheadline))
                .foregroundStyle(Theme.dim)
                .frame(width: 96, alignment: .leading)
            HStack { Spacer(minLength: 0); content() }
        }
    }

    private var epicMenu: some View {
        let name = store.epics.first { $0.id == epicID }?.name ?? "None"
        let active = epicID != nil
        return Menu {
            Button("None") { epicID = nil }
            ForEach(store.epics) { epic in
                Button(epic.name) { epicID = epic.id }
            }
        } label: {
            HStack {
                Text(name).lineLimit(1)
                Spacer()
                Image(systemName: "chevron.down").font(.caption)
            }
            .font(Theme.mono(.subheadline))
            .foregroundStyle(active ? Theme.accent : Theme.dim)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .frame(maxWidth: 200)
            .background(active ? Theme.accent.opacity(0.08) : Theme.surface)
            .overlay(Rectangle().stroke(active ? Theme.accent : Theme.line, lineWidth: 1))
        }
    }

    private var estimateField: some View {
        HStack(spacing: 8) {
            // Hint sits beside the box so the row stays one line tall.
            if estimateInvalid {
                Text("2h, 30m, 2d").font(.caption2).foregroundStyle(.red)
            } else if let minutes = parsedEstimate {
                Text("= \(Format.estimate(minutes))").font(.caption2).foregroundStyle(Theme.ghost)
            }
            TextField("e.g. 2h, 30m, 2d", text: $estimateRaw)
                .font(Theme.mono(.subheadline))
                .foregroundStyle(Theme.ink)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .frame(maxWidth: 140)
                .background(Theme.surface)
                .overlay(Rectangle().stroke(estimateInvalid ? Color.red : Theme.line, lineWidth: 1))
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

/// One chip per status; tapping moves the item immediately. Scrolls only if the chips don't fit.
private struct StatusPicker: View {
    let statuses: [Status]
    let selectedID: String
    let onSelect: (Status) -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            chips
            ScrollView(.horizontal) { chips }.scrollIndicators(.hidden)
        }
    }

    private var chips: some View {
        HStack(spacing: 6) {
            ForEach(statuses) { status in
                let selected = status.id == selectedID
                let color = status.isDone ? Color(hex: "#34d399") : Theme.accent
                Button { if !selected { onSelect(status) } } label: {
                    Text(status.name)
                        .font(Theme.mono(.caption, weight: .semibold))
                        .fixedSize()
                        .padding(.horizontal, 9)
                        .padding(.vertical, 6)
                        .foregroundStyle(selected ? color : Theme.dim)
                        .background(selected ? color.opacity(0.12) : Theme.line)
                        .overlay(Rectangle().stroke(selected ? color.opacity(0.35) : .clear, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }
}
