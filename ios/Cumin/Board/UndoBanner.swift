import SwiftUI

/// Web parity: "… deleted · Undo" toast, shown above the tab bar for a few seconds after any delete.
struct UndoBanner: View {
    @Environment(BoardStore.self) private var store

    var body: some View {
        if let deleted = store.recentlyDeleted {
            HStack(spacing: 12) {
                Text(deleted.label)
                    .font(Theme.font(.footnote))
                    .lineLimit(1)
                    .foregroundStyle(Theme.ink)
                Spacer()
                Button("Undo") { Task { await store.undoDelete() } }
                    .font(Theme.font(.footnote, weight: .bold))
                    .foregroundStyle(Theme.accent)
                    .accessibilityIdentifier("undo-button")
            }
            .padding(12)
            .background(Theme.raised)
            .themedBorder(Theme.line)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .task(id: deleted.id) {
                try? await Task.sleep(for: .seconds(5))
                if !Task.isCancelled { withAnimation { store.dismissUndo() } }
            }
        }
    }
}
