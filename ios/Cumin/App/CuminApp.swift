import GoogleSignIn
import SwiftUI

@main
struct CuminApp: App {
    @State private var auth = AuthService()
    @AppStorage(Appearance.storageKey) private var appearance = Appearance.system

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .preferredColorScheme(appearance.colorScheme)
                .task { await auth.restoreSession() }
                // Google Sign-In returns to the app through the reversed client ID URL scheme.
                .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
        }
    }
}

struct RootView: View {
    @Environment(AuthService.self) private var auth

    var body: some View {
        switch auth.state {
        case .loading:
            ProgressView()
        case .signedOut:
            LoginView()
        case .signedIn(let user):
            MainTabView(user: user, api: auth.api)
        }
    }
}

struct MainTabView: View {
    let user: User
    @State private var board: BoardStore

    init(user: User, api: APIClient) {
        self.user = user
        // Recreated on every sign-in, so a new account never sees the previous one's board.
        _board = State(initialValue: BoardStore(api: api))
    }

    var body: some View {
        TabView {
            NavigationStack { BoardView() }
                .tabItem { Label("Board", systemImage: "rectangle.split.3x1") }
            NavigationStack { ItemListView(kind: .backlog) }
                .tabItem { Label("Backlog", systemImage: "list.bullet") }
            NavigationStack { ItemListView(kind: .all) }
                .tabItem { Label("Items", systemImage: "square.grid.2x2") }
            NavigationStack { DashboardView() }
                .tabItem { Label("Dashboard", systemImage: "chart.bar") }
            NavigationStack { MoreView(user: user) }
                .tabItem { Label("More", systemImage: "ellipsis") }
        }
        .overlay(alignment: .bottom) { UndoBanner().padding(.bottom, 56) }
        .environment(board)
        .tint(Theme.accent)
    }
}

/// Web sidebar's "Organize" group plus Account.
struct MoreView: View {
    let user: User

    var body: some View {
        List {
            Section("Organize") {
                NavigationLink { EpicsView() } label: { Label("Epics", systemImage: "scope") }
                NavigationLink { ProjectsView() } label: { Label("Projects", systemImage: "square.stack.3d.up") }
            }
            .listRowBackground(Theme.surface)
            Section {
                NavigationLink { AccountView(user: user) } label: { Label("Account", systemImage: "person.crop.circle") }
            }
            .listRowBackground(Theme.surface)
        }
        .font(Theme.mono(.subheadline))
        .scrollContentBackground(.hidden)
        .background(Theme.canvas)
        .navigationTitle("More")
        .navigationBarTitleDisplayMode(.inline)
    }
}
