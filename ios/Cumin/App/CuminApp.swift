import GoogleSignIn
import SwiftUI

@main
struct CuminApp: App {
    @State private var auth = AuthService()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
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
            BoardView()
                .tabItem { Label("Board", systemImage: "rectangle.split.3x1") }
            BacklogView()
                .tabItem { Label("Backlog", systemImage: "list.bullet") }
            EpicsView()
                .tabItem { Label("Epics", systemImage: "scope") }
            ProjectsView()
                .tabItem { Label("Projects", systemImage: "square.stack.3d.up") }
            AccountView(user: user)
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
        .overlay(alignment: .bottom) { UndoBanner().padding(.bottom, 56) }
        .environment(board)
        .tint(Theme.accent)
    }
}

struct AccountView: View {
    @Environment(AuthService.self) private var auth
    let user: User

    var body: some View {
        NavigationStack {
            List {
                Section("Signed in as") {
                    HStack(spacing: 12) {
                        AsyncImage(url: URL(string: user.avatarUrl)) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Image(systemName: "person.circle.fill").resizable()
                        }
                        .frame(width: 40, height: 40)
                        .clipShape(Circle())

                        VStack(alignment: .leading) {
                            Text(user.displayName).font(.headline)
                            Text(user.email).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                Section {
                    Button("Sign out", role: .destructive) { auth.signOut() }
                }
            }
            .navigationTitle("Account")
        }
    }
}
