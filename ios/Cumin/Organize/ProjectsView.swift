import SwiftUI

/// Port of ui/src/views/ProjectsView.tsx (list mode): sort, item counts, create, delete.
/// Swipe a row left to delete (web: Delete button + confirm dialog).
struct ProjectsView: View {
    @Environment(BoardStore.self) private var store

    @AppStorage("projects.sortKey") private var sortKey = SortKey.name
    @AppStorage("projects.sortAscending") private var sortAscending = true
    @State private var isCreating = false
    @State private var pendingDelete: Project?

    enum SortKey: String, CaseIterable, Identifiable {
        case prefix = "Prefix", name = "Project", description = "Description", items = "Items"
        var id: String { rawValue }
    }

    private var rows: [(project: Project, count: Int)] {
        let rows = store.projects.map { p in (project: p, count: store.items.filter { $0.projectId == p.id }.count) }
        return rows.sorted { a, b in
            let (x, y) = sortAscending ? (a, b) : (b, a)
            switch sortKey {
            case .prefix: return x.project.prefix < y.project.prefix
            case .name: return x.project.name.lowercased() < y.project.name.lowercased()
            case .description: return x.project.description < y.project.description
            case .items: return x.count < y.count
            }
        }
    }

    var body: some View {
        Group {
            List {
                ForEach(rows, id: \.project.id) { row in
                    ProjectRow(project: row.project, itemCount: row.count)
                        .listRowBackground(Theme.canvas)
                        .listRowSeparatorTint(Theme.line)
                        .swipeActions(edge: .trailing) {
                            Button("Delete", role: .destructive) { pendingDelete = row.project }
                        }
                        .contextMenu {
                            Button("Delete", systemImage: "trash", role: .destructive) { pendingDelete = row.project }
                        }
                }
                if rows.isEmpty && store.hasLoaded {
                    Text("No projects yet.")
                        .font(Theme.font(.footnote))
                        .foregroundStyle(Theme.ghost)
                        .frame(maxWidth: .infinity, minHeight: 80)
                        .listRowBackground(Theme.canvas)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.canvas)
            .safeAreaInset(edge: .top, spacing: 0) {
                HStack {
                    SortMenu(keys: SortKey.allCases, selection: $sortKey, ascending: $sortAscending)
                    Spacer()
                    Text("\(store.projects.count) projects").font(Theme.font(.caption2)).foregroundStyle(Theme.ghost)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .background(Theme.canvas)
            }
            .refreshable { await store.load() }
            .navigationTitle("Projects")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { isCreating = true } label: { Image(systemName: "plus").accessibilityLabel("New project") }
                }
            }
            .sheet(isPresented: $isCreating) { CreateProjectView() }
            .alert(
                "Delete \"\(pendingDelete?.name ?? "")\"?",
                isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } })
            ) {
                Button("Cancel", role: .cancel) {}
                Button("Delete project", role: .destructive) {
                    if let project = pendingDelete { Task { await store.deleteProject(project.id) } }
                }
            } message: {
                Text("All items in this project will be moved to trash.")
            }
            .task { if !store.hasLoaded { await store.load() } }
        }
        .tint(Theme.accent)
    }
}

private struct ProjectRow: View {
    let project: Project
    let itemCount: Int

    var body: some View {
        let color = Color(hex: project.color)
        HStack(alignment: .top, spacing: 12) {
            Text(project.prefix)
                .font(Theme.code(.footnote, weight: .bold))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .foregroundStyle(color)
                .background(color.opacity(0.1))
                .themedClip()
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Circle().fill(color).frame(width: 9, height: 9)
                    Text(project.name).font(Theme.font(.subheadline, weight: .semibold)).foregroundStyle(Theme.ink)
                }
                Text(project.description.isEmpty ? "—" : project.description)
                    .font(Theme.font(.caption))
                    .foregroundStyle(Theme.dim)
                    .lineLimit(2)
            }
            Spacer()
            Text("\(itemCount) items").font(Theme.font(.caption, weight: .medium)).foregroundStyle(Theme.ink.opacity(0.8))
        }
        .padding(.vertical, 6)
    }
}

/// The web's inline "New project" form, as a sheet.
struct CreateProjectView: View {
    @Environment(BoardStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    private static let colors = ["#6b7280", "#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6"]

    @State private var name = ""
    @State private var prefix = ""
    @State private var color = CreateProjectView.colors[0]
    @State private var description = ""
    @State private var isSaving = false
    @State private var error: String?
    @FocusState private var nameFocused: Bool

    private var canCreate: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !prefix.isEmpty && !isSaving
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("Cancel") { dismiss() }.foregroundStyle(Theme.dim)
                Spacer()
                Text("New project").font(Theme.font(.headline, weight: .semibold)).foregroundStyle(Theme.ink)
                Spacer()
                Button(isSaving ? "Creating…" : "Create") { Task { await submit() } }
                    .fontWeight(.semibold)
                    .foregroundStyle(canCreate ? Theme.accent : Theme.ghost)
                    .disabled(!canCreate)
                    .accessibilityIdentifier("create-project")
            }
            .font(Theme.font(.subheadline))
            .buttonStyle(.plain)
            .padding(20)

            Divider().overlay(Theme.line)

            VStack(alignment: .leading, spacing: 20) {
                FormField(label: "Name") {
                    TextField("Interview Prep", text: $name)
                        .textFieldStyle(BoxedTextFieldStyle())
                        .focused($nameFocused)
                        .accessibilityIdentifier("project-name")
                }
                FormField(label: "Prefix (used in item IDs, e.g. INT-1)") {
                    // Uppercase, max 5 (web parity), applied as the text is set so fast typing isn't dropped.
                    TextField("INT", text: Binding(get: { prefix }, set: { prefix = String($0.uppercased().prefix(5)) }))
                        .textFieldStyle(BoxedTextFieldStyle())
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .frame(maxWidth: 120)
                        .accessibilityIdentifier("project-prefix")
                }
                FormField(label: "Color") {
                    ColorSwatchPicker(colors: Self.colors, selection: $color)
                }
                FormField(label: "Description") {
                    TextField("Optional", text: $description).textFieldStyle(BoxedTextFieldStyle())
                }
                if let error {
                    Text(error).font(Theme.font(.footnote)).foregroundStyle(.red)
                }
                Spacer()
            }
            .padding(20)
        }
        .background(Theme.raised)
        .presentationBackground(Theme.sheetBackground)
        .tint(Theme.accent)
        .onAppear { nameFocused = true }
    }

    private func submit() async {
        isSaving = true
        error = nil
        defer { isSaving = false }
        do {
            try await store.createProject(.init(
                name: name.trimmingCharacters(in: .whitespaces),
                prefix: prefix,
                color: color,
                description: description.trimmingCharacters(in: .whitespaces)
            ))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
