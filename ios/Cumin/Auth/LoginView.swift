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
                    .font(.largeTitle.bold())
                Text("Sprint board for life goals")
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                Task { await auth.signInWithGoogle() }
            } label: {
                HStack {
                    if auth.isSigningIn {
                        ProgressView()
                    } else {
                        Image(systemName: "person.crop.circle.badge.checkmark")
                    }
                    Text("Sign in with Google")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(auth.isSigningIn)

            if let error = auth.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(24)
    }
}
