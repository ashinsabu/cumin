import SwiftUI

struct LoginView: View {
    @Environment(AuthService.self) private var auth

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image("logo")
                .resizable()
                .scaledToFit()
                .frame(width: 88, height: 88)

            VStack(spacing: 8) {
                Text("Cumin")
                    .font(Theme.font(.largeTitle, weight: .bold))
                    .foregroundStyle(Theme.ink)
                Text("Sprint board for life goals")
                    .font(Theme.font(.subheadline))
                    .foregroundStyle(Theme.dim)
            }

            Spacer()

            Button {
                Task { await auth.signInWithGoogle() }
            } label: {
                HStack {
                    if auth.isSigningIn {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "person.crop.circle.badge.checkmark")
                    }
                    Text("Sign in with Google")
                        .font(Theme.font(.headline, weight: .semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Theme.accent.opacity(auth.isSigningIn ? 0.6 : 1))
                .themedClip(.card)
            }
            .buttonStyle(.plain)
            .disabled(auth.isSigningIn)

            if let error = auth.errorMessage {
                Text(error)
                    .font(Theme.font(.footnote))
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
    }
}
