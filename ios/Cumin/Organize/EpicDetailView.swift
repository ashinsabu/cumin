import SwiftUI

/// Port of ui/src/components/EpicModal.tsx: edit name/description, progress, items, quick add, delete.
struct EpicDetailView: View {
    @Environment(BoardStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    let epicID: String

    @State private var name = ""
    @State private var description = ""
    @State private var loaded = false
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var confirmDelete = false
    @State private var quickAddTitle = ""
    @State private var showQuickAdd = false
    @State private var selectedItem: SelectedItem?
    @FocusState private var quickAddFocused: Bool

    private var epic: Epic? { store.epics.first { $0.id == epicID } }

    private var isDirty: Bool {
        guard let epic else { return false }
        return name != epic.name || description != epic.description
    }

    var body: some View {
        Group {
            if let epic {
                content(store.stats(for: epic))
            } else {
                ContentUnavailableView("Epic not found", systemImage: "questionmark.square.dashed")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.raised)
        .presentationBackground(Theme.raised)
        .tint(Theme.accent)
        .onAppear(perform: loadFields)
        .sheet(item: $selectedItem) {
            ItemDetailView(itemID: $0.id)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private func content(_ stats: EpicStats) -> some View {
        let color = Color(hex: stats.epic.color)
        let statusNames = Dictionary(uniqueKeysWithValues: store.statuses.map { ($0.id, $0.name) })
        return VStack(spacing: 0) {
            // Header
            HStack(spacing: 10) {
                Circle().fill(color).frame(width: 12, height: 12)
                EpicTypeBadge(type: stats.epic.type)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.dim)
                        .padding(6)
                        .accessibilityLabel("Close")
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 12)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("Epic name", text: $name, axis: .vertical)
                            .font(Theme.mono(.title3, weight: .bold))
                            .foregroundStyle(Theme.ink)
                        TextField("Add a description…", text: $description, axis: .vertical)
                            .font(Theme.mono(.subheadline))
                            .foregroundStyle(Theme.dim)
                            .lineLimit(2...6)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 16)

                    Divider().overlay(Theme.line)

                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            sectionLabel("Progress")
                            Spacer()
                            Text("\(stats.progress)%").font(Theme.mono(.subheadline, weight: .bold)).foregroundStyle(Theme.ink)
                        }
                        ProgressLine(progress: stats.progress, color: color, height: 7)
                        HStack {
                            Text("\(stats.doneCount) done")
                            Spacer()
                            Text("\(stats.items.count) total")
                        }
                        .font(Theme.mono(.caption))
                        .foregroundStyle(Theme.ghost)
                    }
                    .padding(20)

                    Divider().overlay(Theme.line)

                    VStack(spacing: 12) {
                        statRow("Estimate", stats.totalEstimate > 0 ? Format.estimate(stats.totalEstimate) : "—")
                        if let raw = stats.epic.deadline, let date = Deadline.date(from: raw) {
                            statRow("Deadline", date.formatted(.dateTime.day().month(.abbreviated).year()))
                        }
                    }
                    .padding(20)

                    HStack {
                        sectionLabel("Items")
                        Spacer()
                        Button("+ Add item") {
                            showQuickAdd.toggle()
                            quickAddFocused = showQuickAdd
                        }
                        .font(Theme.mono(.caption, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                        .accessibilityIdentifier("epic-add-item")
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 8)

                    Divider().overlay(Theme.line)

                    if showQuickAdd { quickAdd(epicID: stats.epic.id) }

                    ForEach(stats.items) { item in
                        EpicItemRow(item: item, statusName: statusNames[item.statusId] ?? "—")
                            .contentShape(Rectangle())
                            .onTapGesture { selectedItem = SelectedItem(id: item.id) }
                        Divider().overlay(Theme.line)
                    }
                    if stats.items.isEmpty && !showQuickAdd {
                        Text("No items yet.")
                            .font(Theme.mono(.footnote))
                            .foregroundStyle(Theme.ghost)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 24)
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)

            Divider().overlay(Theme.line)
            footer(stats)
        }
    }

    private func quickAdd(epicID: String) -> some View {
        HStack(spacing: 8) {
            TextField("Item title…", text: $quickAddTitle)
                .font(Theme.mono(.subheadline))
                .focused($quickAddFocused)
                .submitLabel(.done)
                .onSubmit { Task { await addItem(epicID: epicID) } }
                .accessibilityIdentifier("epic-quick-add")
            if !quickAddTitle.trimmingCharacters(in: .whitespaces).isEmpty {
                Button("Add") { Task { await addItem(epicID: epicID) } }
                    .font(Theme.mono(.caption, weight: .semibold))
                    .foregroundStyle(Theme.accent)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(Theme.surface.opacity(0.5))
        .overlay(alignment: .bottom) { Divider().overlay(Theme.line) }
    }

    private func footer(_ stats: EpicStats) -> some View {
        HStack(spacing: 12) {
            if confirmDelete {
                Text("Move epic + \(stats.items.count) items to trash?")
                    .foregroundStyle(Theme.dim)
                    .lineLimit(2)
                Spacer()
                Button("Cancel") { confirmDelete = false }.foregroundStyle(Theme.dim)
                Button("Delete") {
                    Task { await store.deleteEpic(stats.epic.id) }
                    dismiss()
                }
                .fontWeight(.semibold)
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.red)
                .accessibilityIdentifier("confirm-delete-epic")
            } else {
                Button("Delete epic") { confirmDelete = true }
                    .foregroundStyle(Theme.dim)
                    .accessibilityIdentifier("delete-epic")
                Spacer()
                if let saveError { Text(saveError).foregroundStyle(.red).lineLimit(1) }
                if isDirty {
                    Button(isSaving ? "Saving…" : "Save") { Task { await save() } }
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(Theme.accent)
                        .disabled(isSaving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                        .accessibilityIdentifier("save-epic")
                }
            }
        }
        .font(Theme.mono(.footnote))
        .buttonStyle(.plain)
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Theme.panel)
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(Theme.mono(.caption, weight: .semibold))
            .tracking(0.5)
            .foregroundStyle(Theme.ghost)
    }

    private func statRow(_ label: String, _ value: String) -> some View {
        HStack {
            sectionLabel(label)
            Spacer()
            Text(value).font(Theme.mono(.subheadline, weight: .semibold)).foregroundStyle(Theme.ink)
        }
    }

    private func loadFields() {
        guard !loaded, let epic else { return }
        loaded = true
        name = epic.name
        description = epic.description
    }

    private func save() async {
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            try await store.updateEpic(epicID, .init(name: name.trimmingCharacters(in: .whitespaces), description: description))
        } catch {
            saveError = error.localizedDescription
        }
    }

    private func addItem(epicID: String) async {
        let title = quickAddTitle.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty, let projectID = store.projects.first?.id else { return }
        do {
            try await store.create(.init(title: title, projectId: projectID, epicId: epicID, priority: 3, estimateMinutes: nil))
            quickAddTitle = ""
            showQuickAdd = false
        } catch {
            saveError = error.localizedDescription
        }
    }
}

/// Web ItemRow with id / priority / title / estimate / status columns.
private struct EpicItemRow: View {
    let item: Item
    let statusName: String

    var body: some View {
        let priority = PriorityStyle.of(item.priority)
        HStack(spacing: 10) {
            Text(item.displayId).font(Theme.mono(.caption, weight: .medium)).foregroundStyle(Theme.accent)
            Text(priority.label).font(Theme.mono(.caption, weight: .bold)).foregroundStyle(priority.color)
            Text(item.title).font(Theme.mono(.subheadline)).foregroundStyle(Theme.ink).lineLimit(1)
            Spacer(minLength: 4)
            if let estimate = item.estimateMinutes {
                Text(Format.estimate(estimate)).font(Theme.mono(.caption)).foregroundStyle(Theme.dim)
            }
            Text(statusName)
                .font(Theme.mono(.caption2, weight: .semibold))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Theme.line)
                .foregroundStyle(Theme.ink.opacity(0.8))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }
}
