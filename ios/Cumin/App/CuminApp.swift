import GoogleSignIn
import SwiftUI

@main
struct CuminApp: App {
    @State private var auth = AuthService()
    @AppStorage(Appearance.storageKey) private var appearance = Appearance.system
    @AppStorage(ThemePreset.storageKey) private var preset = ThemePreset.cyber

    init() {
        ThemeChrome.apply()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .tint(Theme.accent)
            .onChange(of: preset) { ThemeChrome.apply() }
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
    @State private var queue: QueueStore
    @SceneStorage("selectedTab") private var selectedTab = 0
    @AppStorage(ThemePreset.storageKey) private var preset = ThemePreset.cyber
    @Environment(\.scenePhase) private var scenePhase

    init(user: User, api: APIClient) {
        self.user = user
        // Recreated on every sign-in, so a new account never sees the previous one's data.
        _board = State(initialValue: BoardStore(api: api))
        _queue = State(initialValue: QueueStore(api: api))
    }

    var body: some View {
        // Mirrors the web sidebar: Board, Items, then the Queue (the web's drawer) and More for the rest.
        TabView(selection: $selectedTab) {
            NavigationStack { BoardView() }
                .tabItem { Label("Board", systemImage: "rectangle.split.3x1") }.tag(0)
            NavigationStack { ItemsView() }
                .tabItem { Label("Items", systemImage: "square.grid.2x2") }.tag(1)
            if queue.isEnabled {
                NavigationStack { QueueView() }
                    .tabItem { Label("Queue", systemImage: "tray.full") }.tag(2)
                    // Red count of entries whose deadline day has passed.
                    .badge(queue.overdueCount)
            }
            MoreView(user: user) { filters in
                ItemFilters.apply(filters)
                selectedTab = 1
            }
            .tabItem { Label("More", systemImage: "ellipsis") }.tag(3)
        }
        // Theme tokens are read statically, so rebuild the screens when the preset changes.
        // Only the tabs rebuild: the stores above survive, so data doesn't reload.
        .id(preset)
        .tint(Theme.accent)
        // Load the queue up front so the overdue badge is right before the tab is opened.
        .task { await queue.load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await queue.load() } }
        }
        .overlay(alignment: .bottom) { UndoBanner().padding(.bottom, 56) }
        .environment(board)
        .environment(queue)
        .tint(Theme.accent)
    }
}

/// The rest of the web sidebar, in its order: My Views, Organize, Insights — plus Account.
struct MoreView: View {
    enum Route: Hashable { case dashboard, epics, projects, account }

    @Environment(BoardStore.self) private var store
    let user: User
    /// Opens Items with a saved view's filters (web: clicking a view in the sidebar).
    let openView: (SavedView.Filters) -> Void

    init(user: User, openView: @escaping (SavedView.Filters) -> Void) {
        self.user = user
        self.openView = openView
        // After a theme change the tabs rebuild; start already on Account (no push animation).
        let reopen = UserDefaults.standard.bool(forKey: "more.reopenAccount")
        _path = State(initialValue: reopen ? [.account] : [])
    }
    @State private var path: [Route] = []
    /// Set by Account when the theme changes: the app rebuilds, so reopen Account afterwards.
    @AppStorage("more.reopenAccount") private var reopenAccount = false

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if !store.views.isEmpty {
                    Section {
                        ForEach(store.views) { view in
                            Button { openView(view.filters) } label: {
                                Label(view.name, systemImage: "bookmark")
                            }
                            .foregroundStyle(Theme.ink)
                            .swipeActions {
                                Button("Delete", role: .destructive) { Task { await store.deleteView(view.id) } }
                            }
                        }
                    } header: {
                        SectionHeader("My Views")
                    }
                    .listRowBackground(Theme.surface)
                }
                Section {
                    NavigationLink(value: Route.epics) { Label("Epics", systemImage: "scope") }
                    NavigationLink(value: Route.projects) { Label("Projects", systemImage: "square.stack.3d.up") }
                } header: {
                    SectionHeader("Organize")
                }
                .listRowBackground(Theme.surface)
                Section {
                    NavigationLink(value: Route.dashboard) { Label("Dashboards", systemImage: "chart.bar") }
                } header: {
                    SectionHeader("Insights")
                }
                .listRowBackground(Theme.surface)
                Section {
                    NavigationLink(value: Route.account) { Label("Account", systemImage: "person.crop.circle") }
                }
                .listRowBackground(Theme.surface)
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .dashboard: DashboardView()
                case .epics: EpicsView()
                case .projects: ProjectsView()
                case .account: AccountView(user: user)
                }
            }
            .font(Theme.font(.subheadline))
            .scrollContentBackground(.hidden)
            .background(Theme.canvas)
            .navigationTitle("More")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                // Clear the flag from the instance that stays on screen (the root can rebuild twice).
                guard reopenAccount else { return }
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled else { return }
                reopenAccount = false
            }
        }
    }
}
