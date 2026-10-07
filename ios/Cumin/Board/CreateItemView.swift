import SwiftUI

/// Port of ui/src/components/CreateItemModal.tsx. New items land in the board's first status.
struct CreateItemView: View {
    @Environment(BoardStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var projectID: String?
    @State private var epicID: String?
    @State private var priority = 3
    @State private var estimateRaw = ""
    @State private var isSubmitting = false
    @State private var error: String?
    @FocusState private var titleFocused: Bool

    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespaces) }
    private var parsedEstimate: Int? { Format.parseEstimate(estimateRaw) }
    private var estimateInvalid: Bool { !estimateRaw.trimmingCharacters(in: .whitespaces).isEmpty && parsedEstimate == nil }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Item title", text: $title, axis: .vertical)
                        .font(Theme.mono(.body))
                        .focused($titleFocused)
                }

                Section {
                    Picker("Project", selection: $projectID) {
                        ForEach(store.projects) { project in
                            Text("\(project.name) (\(project.prefix))").tag(Optional(project.id))
                        }
                    }
                    if !store.epics.isEmpty {
                        Picker("Epic", selection: $epicID) {
                            Text("None").tag(String?.none)
                            ForEach(store.epics) { epic in
                                Text(epic.name).tag(Optional(epic.id))
                            }
                        }
                    }
                }

                Section("Priority") {
                    PriorityPicker(priority: $priority)
                }

                Section {
                    TextField("e.g. 2h, 30m, 1h30m, 2d", text: $estimateRaw)
                        .font(Theme.mono(.body))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Estimate (optional)")
                } footer: {
                    if estimateInvalid {
                        Text("Use formats like 2h, 30m, 1h30m, 2d").foregroundStyle(.red)
                    } else if let minutes = parsedEstimate {
                        Text("= \(Format.estimate(minutes))")
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.footnote) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.canvas)
            .navigationTitle("New item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? "Creating…" : "Create") { Task { await submit() } }
                        .disabled(isSubmitting || trimmedTitle.isEmpty || projectID == nil || estimateInvalid)
                }
            }
            .onAppear {
                projectID = projectID ?? store.projects.first?.id
                titleFocused = true
            }
        }
        .tint(Theme.accent)
    }

    private func submit() async {
        guard let projectID else {
            error = "Select a project"
            return
        }
        isSubmitting = true
        error = nil
        defer { isSubmitting = false }
        do {
            try await store.create(.init(
                title: trimmedTitle,
                projectId: projectID,
                epicId: epicID,
                priority: priority,
                estimateMinutes: parsedEstimate
            ))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
