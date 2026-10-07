import SwiftUI
import UIKit

/// Ashin's default web theme ("cyber" preset, ui/src/themes/index.ts), following the system light/dark mode.
enum Theme {
    static let canvas = Color(light: "#f5f4f2", dark: "#09090b")
    static let surface = Color(light: "#ffffff", dark: "#111113")
    static let raised = Color(light: "#ffffff", dark: "#161618")
    static let panel = Color(light: "#f0eeec", dark: "#0c0c0e")
    static let line = Color(light: "#e2e0de", dark: "#1e1e24")
    static let ink = Color(light: "#0c0c0e", dark: "#fafafa")
    static let dim = Color(light: "#6b7280", dark: "#a1a1aa")
    static let ghost = Color(light: "#a1a1aa", dark: "#71717a")
    static let accent = Color(hex: "#e11d48")

    /// Cyber preset uses square corners everywhere.
    static let radius: CGFloat = 0

    static func mono(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        .system(style, design: .monospaced).weight(weight)
    }
}

/// ui/src/constants.ts PRIORITY.
struct PriorityStyle {
    let label: String
    let color: Color
    let bg: Color

    static func of(_ priority: Int) -> PriorityStyle {
        switch priority {
        case 0: PriorityStyle(label: "P0", color: Color(hex: "#dc2626"), bg: Color(hex: "#fef2f2"))
        case 1: PriorityStyle(label: "P1", color: Color(hex: "#ea580c"), bg: Color(hex: "#fff7ed"))
        case 2: PriorityStyle(label: "P2", color: Color(hex: "#ca8a04"), bg: Color(hex: "#fefce8"))
        case 3: PriorityStyle(label: "P3", color: Color(hex: "#2563eb"), bg: Color(hex: "#eff6ff"))
        default: PriorityStyle(label: "P4", color: Color(hex: "#6b7280"), bg: Color(hex: "#f9fafb"))
        }
    }
}

extension Color {
    /// "#rrggbb" → Color. Falls back to gray for malformed input.
    init(hex: String) {
        self.init(uiColor: UIColor(hex: hex))
    }

    init(light: String, dark: String) {
        self.init(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

extension UIColor {
    convenience init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard s.count == 6, let v = UInt32(s, radix: 16) else {
            self.init(white: 0.5, alpha: 1)
            return
        }
        self.init(
            red: CGFloat((v >> 16) & 0xff) / 255,
            green: CGFloat((v >> 8) & 0xff) / 255,
            blue: CGFloat(v & 0xff) / 255,
            alpha: 1
        )
    }
}
