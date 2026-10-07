import Foundation
import GoogleSignIn
import Observation
import UIKit

/// Owns the signed-in state.
///
/// Flow: Google Sign-In SDK → Google ID token → POST /api/auth/google/mobile →
/// Cumin JWT (stored in Keychain) → sent as `Authorization: Bearer` on every API call.
@MainActor
@Observable
final class AuthService {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(User)
    }

    private(set) var state: State = .loading
    private(set) var errorMessage: String?
    private(set) var isSigningIn = false

    let api: APIClient
    private let keychain = KeychainStore()
    private let tokenKey = "session_token"

    init(api: APIClient = APIClient()) {
        self.api = api
    }

    /// On launch: if we have a saved token, check it's still valid with /api/auth/me.
    func restoreSession() async {
        guard let token = keychain.read(tokenKey) else {
            state = .signedOut
            return
        }
        api.token = token
        do {
            let user: User = try await api.get("/api/auth/me")
            state = .signedIn(user)
        } catch let error as APIError where error.isUnauthorized {
            clearSession()
        } catch {
            // Offline or server down: keep the token, but we can't show the user yet.
            errorMessage = error.localizedDescription
            state = .signedOut
        }
    }

    func signInWithGoogle() async {
        guard let presenter = UIApplication.shared.topViewController else { return }
        isSigningIn = true
        errorMessage = nil
        defer { isSigningIn = false }

        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else {
                errorMessage = "Google didn't return an ID token."
                return
            }
            let response: MobileLoginResponse = try await api.post(
                "/api/auth/google/mobile",
                body: MobileLoginRequest(idToken: idToken)
            )
            keychain.write(response.token, for: tokenKey)
            api.token = response.token
            state = .signedIn(response.user)
        } catch let error as GIDSignInError where error.code == .canceled {
            // User closed the Google sheet. Not an error.
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
        clearSession()
    }

    private func clearSession() {
        keychain.delete(tokenKey)
        api.token = nil
        state = .signedOut
    }
}

private struct MobileLoginRequest: Encodable {
    let idToken: String
}

private struct MobileLoginResponse: Decodable {
    let token: String
    let user: User
}

extension UIApplication {
    /// The view controller Google Sign-In presents its sheet from.
    var topViewController: UIViewController? {
        let root = connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
        var top = root
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}
