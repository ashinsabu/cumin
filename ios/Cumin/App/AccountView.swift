import SwiftUI

/// Port of ui/src/views/AccountView.tsx: Profile, Appearance, Recently Deleted, Sign out.
/// Appearance: the web's three theme presets plus light/dark/system.
struct AccountView: View {
    @Environment(AuthService.self) private var auth
    @Environment(BoardStore.self) private var store
    @AppStorage(Appearance.storageKey) private var appearance = Appearance.system
    @AppStorage(ThemePreset.storageKey) private var preset = ThemePreset.cyber

    let user: User

    @State private var trash: Trash?
    @State private var restoring: String?
    @State private var trashError: String?
    @State private var confirmEmpty = false

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    AsyncImage(url: URL(string: user.avatarUrl)) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Text(initials)
                            .font(Theme.font(.headline, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(Theme.accent)
                    }
                    .frame(width: 52, height: 52)
                    .clipShape(Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text(user.displayName).font(Theme.font(.subheadline, weight: .semibold)).foregroundStyle(Theme.ink)
                        Text(user.email).font(Theme.font(.caption)).foregroundStyle(Theme.dim)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("ID PREFIX").font(Theme.font(.caption2, weight: .semibold)).foregroundStyle(Theme.ghost)
                    Text(user.idPrefix).font(Theme.code(.subheadline, weight: .semibold)).foregroundStyle(Theme.ink)
                    Text("Item IDs: \(user.idPrefix)-1, \(user.idPrefix)-2, …").font(Theme.font(.caption2)).foregroundStyle(Theme.ghost)
                }
            } header: {
                SectionHeader("Profile")
            }
            .listRowBackground(Theme.surface)

            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("THEME").font(Theme.font(.caption2, weight: .semibold)).foregroundStyle(Theme.ghost)
                    Picker("Theme", selection: Binding(get: { preset }, set: { newValue in
                        // The app rebuilds on a theme change; come back to this screen afterwards.
                        UserDefaults.standard.set(true, forKey: "more.reopenAccount")
                        preset = newValue
                    })) {
                        ForEach(ThemePreset.allCases) { Text($0.name).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("MODE").font(Theme.font(.caption2, weight: .semibold)).foregroundStyle(Theme.ghost)
                    Picker("Mode", selection: $appearance) {
                        ForEach(Appearance.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
            } header: {
                SectionHeader("Appearance")
            }
            .listRowBackground(Theme.surface)

            Section {
                if let trash {
                    if trash.isEmpty {
                        Text("Nothing in trash.").font(Theme.font(.footnote)).foregroundStyle(Theme.ghost)
                    }
                    ForEach(trash.projects) { p in
                        trashRow(color: p.color, title: "\(p.name)  \(p.prefix)", kind: "Project", deletedAt: p.deletedAt, count: p.itemCount) {
                            await restore(path: "projects", id: p.id)
                        }
                    }
                    ForEach(trash.epics) { e in
                        trashRow(color: e.color, title: e.name, kind: "Epic", deletedAt: e.deletedAt, count: e.itemCount) {
                            await restore(path: "epics", id: e.id)
                        }
                    }
                    if !trash.isEmpty {
                        Button("Empty trash", role: .destructive) { confirmEmpty = true }
                            .font(Theme.font(.footnote, weight: .medium))
                    }
                } else {
                    ProgressView()
                }
                if let trashError {
                    Text(trashError).font(Theme.font(.footnote)).foregroundStyle(.red)
                }
            } header: {
                SectionHeader("Recently Deleted")
            } footer: {
                Text("Deleted projects and epics are permanently removed after 30 days.")
                    .font(Theme.font(.caption2))
                    .foregroundStyle(Theme.ghost)
            }
            .listRowBackground(Theme.surface)

            Section {
                Button("Sign out", role: .destructive) { auth.signOut() }
                    .font(Theme.font(.body, weight: .medium))
            }
            .listRowBackground(Theme.surface)
        }
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadTrash() }
        .refreshable { await loadTrash() }
        .confirmationDialog("Permanently delete everything in trash?", isPresented: $confirmEmpty, titleVisibility: .visible) {
            Button("Empty trash", role: .destructive) { Task { await emptyTrash() } }
        } message: {
            Text("This cannot be undone.")
        }
    }

    private var initials: String {
        user.displayName.split(separator: " ").compactMap(\.first).prefix(2).map(String.init).joined().uppercased()
    }

    private func trashRow(color: String, title: String, kind: String, deletedAt: Date, count: Int,
                          restore: @escaping () async -> Void) -> some View {
        let days = Calendar.current.dateComponents([.day], from: deletedAt, to: .now).day ?? 0
        let ago = days == 0 ? "today" : days == 1 ? "yesterday" : "\(days)d ago"
        let purgeIn = max(0, 30 - days)
        let id = title + kind
        return HStack(spacing: 10) {
            Circle().fill(Color(hex: color)).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.font(.footnote, weight: .medium)).foregroundStyle(Theme.ink)
                Text("\(kind) · deleted \(ago) · \(count) items · purges in \(purgeIn)d")
                    .font(Theme.font(.caption2)).foregroundStyle(Theme.ghost)
            }
            Spacer()
            Button(restoring == id ? "…" : "Restore") {
                Task {
                    restoring = id
                    await restore()
                    restoring = nil
                }
            }
            .font(Theme.font(.caption, weight: .medium))
            .buttonStyle(.bordered)
            .disabled(restoring != nil)
        }
    }

    private func loadTrash() async {
        do {
            trash = try await store.loadTrash()
            trashError = nil
        } catch {
            trashError = error.localizedDescription
        }
    }

    private func restore(path: String, id: String) async {
        do {
            try await store.restoreFromTrash(path: path, id: id)
        } catch {
            trashError = error.localizedDescription
        }
        await loadTrash()
    }

    private func emptyTrash() async {
        do {
            try await store.emptyTrash()
        } catch {
            trashError = error.localizedDescription
        }
        await loadTrash()
    }
}

/// Light / dark / follow the phone. Applied at the app root.
enum Appearance: String, CaseIterable, Identifiable {
    case system, dark, light
    static let storageKey = "appearance"
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .dark: .dark
        case .light: .light
        }
    }
}

// MARK: - Trash API (GET/DELETE /api/trash, POST /api/{projects|epics}/{id}/restore)

struct Trash: Decodable {
    struct Project: Decodable, Identifiable {
        let id: String
        let name: String
        let prefix: String
        let color: String
        let deletedAt: Date
        let itemCount: Int
    }

    struct Epic: Decodable, Identifiable {
        let id: String
        let name: String
        let color: String
        let deletedAt: Date
        let itemCount: Int
    }

    let projects: [Project]
    let epics: [Epic]

    var isEmpty: Bool { projects.isEmpty && epics.isEmpty }

    enum CodingKeys: String, CodingKey { case projects, epics }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        projects = try c.decodeIfPresent([Project].self, forKey: .projects) ?? []
        epics = try c.decodeIfPresent([Epic].self, forKey: .epics) ?? []
    }
}

extension BoardStore {
    func loadTrash() async throws -> Trash {
        try await apiClient.get("/api/trash")
    }

    func restoreFromTrash(path: String, id: String) async throws {
        let _: APIClient.Empty = try await apiClient.post("/api/\(path)/\(id)/restore", body: APIClient.Empty())
        await load()
    }

    func emptyTrash() async throws {
        let _: APIClient.Empty = try await apiClient.send("DELETE", "/api/trash", body: Optional<APIClient.Empty>.none)
    }
}
