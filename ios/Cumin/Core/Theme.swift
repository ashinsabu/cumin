import SwiftUI
import UIKit

/// The web's theme presets (ui/src/themes/index.ts). Chosen in Account → Appearance; light/dark is separate.
enum ThemePreset: String, CaseIterable, Identifiable {
    case cyber, glass, minimal

    static let storageKey = "theme.preset"
    var id: String { rawValue }
    var name: String { rawValue.capitalized }

    fileprivate var spec: ThemeSpec {
        switch self {
        case .cyber: .cyber
        case .glass: .glass
        case .minimal: .minimal
        }
    }
}

/// Design tokens for the active preset. Views read these statically; the app root is rebuilt
/// (via `.id(preset)`) when the preset changes, so every screen picks up the new values.
enum Theme {
    static var preset: ThemePreset {
        UserDefaults.standard.string(forKey: ThemePreset.storageKey).flatMap(ThemePreset.init) ?? .cyber
    }
    private static var spec: ThemeSpec { preset.spec }

    static var canvas: Color { spec.canvas }
    static var surface: Color { spec.surface }
    static var raised: Color { spec.raised }
    static var panel: Color { spec.panel }
    static var line: Color { spec.line }
    static var ink: Color { spec.ink }
    static var dim: Color { spec.dim }
    static var ghost: Color { spec.ghost }
    static var accent: Color { spec.accent }

    /// Corner radius for cards, inputs and chips (`card`) and for small tags (`badge`).
    static func radius(_ kind: RadiusKind = .card) -> CGFloat {
        kind == .card ? spec.cardRadius : spec.badgeRadius
    }

    /// Sheet background: frosted for Glass, solid otherwise.
    static var sheetBackground: AnyShapeStyle {
        spec.blur ? AnyShapeStyle(.ultraThinMaterial) : AnyShapeStyle(raised)
    }

    static var usesBlur: Bool { spec.blur }

    /// Body text font for the preset (Geist Mono for Cyber, Geist for Glass, system for Minimal).
    static func font(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        spec.body.font(style, weight: weight)
    }

    /// Monospace font for IDs and prefixes (web `font-mono`).
    static func code(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        spec.mono.font(style, weight: weight)
    }

    /// UIKit font for bars (navigation titles, tab labels), matching the preset's body font.
    static func uiFont(_ style: UIFont.TextStyle, weight: UIFont.Weight) -> UIFont {
        spec.body.uiFont(style, weight: weight)
    }
}

enum RadiusKind { case card, badge }

// MARK: - Presets

private struct ThemeSpec {
    let canvas, surface, raised, panel, line, ink, dim, ghost, accent: Color
    let body: FontFamily
    let mono: FontFamily
    let cardRadius: CGFloat
    let badgeRadius: CGFloat
    let blur: Bool

    /// Hex pairs are (light, dark); 8-digit hex carries alpha (web rgba values).
    init(canvas: (String, String), surface: (String, String), raised: (String, String), panel: (String, String),
         line: (String, String), ink: (String, String), dim: (String, String), ghost: (String, String),
         accent: String, body: FontFamily, mono: FontFamily, cardRadius: CGFloat, badgeRadius: CGFloat, blur: Bool) {
        func c(_ pair: (String, String)) -> Color { Color(light: pair.0, dark: pair.1) }
        self.canvas = c(canvas); self.surface = c(surface); self.raised = c(raised); self.panel = c(panel)
        self.line = c(line); self.ink = c(ink); self.dim = c(dim); self.ghost = c(ghost)
        self.accent = Color(hex: accent)
        self.body = body; self.mono = mono
        self.cardRadius = cardRadius; self.badgeRadius = badgeRadius; self.blur = blur
    }

    static let cyber = ThemeSpec(
        canvas: ("#f5f4f2", "#09090b"), surface: ("#ffffff", "#111113"), raised: ("#ffffff", "#161618"),
        panel: ("#f0eeec", "#0c0c0e"), line: ("#e2e0de", "#1e1e24"), ink: ("#0c0c0e", "#fafafa"),
        dim: ("#6b7280", "#a1a1aa"), ghost: ("#a1a1aa", "#71717a"), accent: "#e11d48",
        body: .geistMono, mono: .geistMono, cardRadius: 0, badgeRadius: 0, blur: false
    )

    static let glass = ThemeSpec(
        canvas: ("#ebebf5", "#0d0d14"), surface: ("#ffffffbf", "#ffffff0d"), raised: ("#ffffffeb", "#ffffff14"),
        panel: ("#ffffff8c", "#ffffff08"), line: ("#00000014", "#ffffff14"), ink: ("#0f0e1a", "#f1f0ff"),
        dim: ("#6b6b80", "#8b8ba7"), ghost: ("#a0a0b0", "#4a4a5a"), accent: "#7c3aed",
        body: .geist, mono: .geistMono, cardRadius: 8, badgeRadius: 4, blur: true
    )

    static let minimal = ThemeSpec(
        canvas: ("#f5f5f7", "#1c1c1e"), surface: ("#ffffff", "#2c2c2e"), raised: ("#ffffff", "#3a3a3c"),
        panel: ("#fafafa", "#1c1c1e"), line: ("#e5e5ea", "#38383a"), ink: ("#1c1c1e", "#f5f5f7"),
        dim: ("#6c6c70", "#8e8e93"), ghost: ("#aeaeb2", "#48484a"), accent: "#3b82f6",
        body: .system, mono: .systemMono, cardRadius: 6, badgeRadius: 4, blur: false
    )
}

private enum FontFamily {
    case geist, geistMono, system, systemMono

    private func face(_ weight: Font.Weight) -> String {
        let family = self == .geist ? "Geist" : "GeistMono"
        let suffix = switch weight {
        case .medium: "Medium"
        case .semibold: "SemiBold"
        case .bold: "Bold"
        case .heavy, .black: "Black"
        default: "Regular"
        }
        return "\(family)-\(suffix)"
    }

    func font(_ style: Font.TextStyle, weight: Font.Weight) -> Font {
        switch self {
        case .system: .system(style).weight(weight)
        case .systemMono: .system(style, design: .monospaced).weight(weight)
        case .geist, .geistMono:
            // Bundled static weights (Resources/Fonts), sized from the text style so Dynamic Type still works.
            .custom(face(weight), size: UIFont.preferredFont(forTextStyle: style.uiKit).pointSize, relativeTo: style)
        }
    }

    func uiFont(_ style: UIFont.TextStyle, weight: UIFont.Weight) -> UIFont {
        let size = UIFont.preferredFont(forTextStyle: style).pointSize
        switch self {
        case .system: return .systemFont(ofSize: size, weight: weight)
        case .systemMono: return .monospacedSystemFont(ofSize: size, weight: weight)
        case .geist, .geistMono:
            let swiftWeight: Font.Weight = switch weight {
            case .medium: .medium
            case .semibold: .semibold
            case .bold: .bold
            case .heavy, .black: .black
            default: .regular
            }
            return UIFont(name: face(swiftWeight), size: size) ?? .systemFont(ofSize: size, weight: weight)
        }
    }
}

private extension Font.TextStyle {
    var uiKit: UIFont.TextStyle {
        switch self {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        default: .body
        }
    }
}

// MARK: - App-wide chrome

enum ThemeChrome {
    /// Styles UIKit-backed chrome (nav bars, tab bar, segmented controls) to match the preset.
    /// Called before the root is (re)built so new bars pick it up.
    static func apply() {
        let ink = UIColor(Theme.ink)
        let dim = UIColor(Theme.dim)
        let accent = UIColor(Theme.accent)

        let nav = UINavigationBarAppearance()
        if Theme.usesBlur { nav.configureWithDefaultBackground() } else { nav.configureWithOpaqueBackground() }
        if !Theme.usesBlur { nav.backgroundColor = UIColor(Theme.canvas) }
        nav.shadowColor = UIColor(Theme.line)
        nav.titleTextAttributes = [.foregroundColor: ink, .font: Theme.uiFont(.headline, weight: .semibold)]
        nav.largeTitleTextAttributes = [.foregroundColor: ink, .font: Theme.uiFont(.largeTitle, weight: .bold)]
        let barButton = UIBarButtonItemAppearance()
        barButton.normal.titleTextAttributes = [.font: Theme.uiFont(.body, weight: .regular)]
        nav.buttonAppearance = barButton
        nav.backButtonAppearance = barButton
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav

        let tab = UITabBarAppearance()
        if Theme.usesBlur { tab.configureWithDefaultBackground() } else { tab.configureWithOpaqueBackground() }
        if !Theme.usesBlur { tab.backgroundColor = UIColor(Theme.canvas) }
        tab.shadowColor = UIColor(Theme.line)
        let item = UITabBarItemAppearance()
        let tabFont = Theme.uiFont(.caption2, weight: .medium)
        item.normal.iconColor = dim
        item.normal.titleTextAttributes = [.foregroundColor: dim, .font: tabFont]
        item.selected.iconColor = accent
        item.selected.titleTextAttributes = [.foregroundColor: accent, .font: tabFont]
        tab.stackedLayoutAppearance = item
        tab.inlineLayoutAppearance = item
        tab.compactInlineLayoutAppearance = item
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab

        let segmented = UISegmentedControl.appearance()
        segmented.selectedSegmentTintColor = accent
        segmented.setTitleTextAttributes([.foregroundColor: UIColor.white, .font: Theme.uiFont(.footnote, weight: .semibold)], for: .selected)
        segmented.setTitleTextAttributes([.foregroundColor: dim, .font: Theme.uiFont(.footnote, weight: .regular)], for: .normal)

        UISearchTextField.appearance().font = Theme.uiFont(.body, weight: .regular)
    }
}

// MARK: - Text

/// List/form section heading in the theme font (system headings otherwise ignore the preset).
struct SectionHeader: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text.uppercased())
            .font(Theme.font(.caption, weight: .semibold))
            .tracking(0.5)
            .foregroundStyle(Theme.ghost)
    }
}

// MARK: - Shapes

extension View {
    /// Clips to the theme's corner radius and draws a 1pt border (square in Cyber).
    func themedBorder(_ color: Color, radius: RadiusKind = .card, lineWidth: CGFloat = 1) -> some View {
        let r = Theme.radius(radius)
        return clipShape(RoundedRectangle(cornerRadius: r))
            .overlay(RoundedRectangle(cornerRadius: r).stroke(color, lineWidth: lineWidth))
    }

    /// Clips to the theme's corner radius without a border (tags, filled buttons).
    func themedClip(_ radius: RadiusKind = .badge) -> some View {
        clipShape(RoundedRectangle(cornerRadius: Theme.radius(radius)))
    }
}

// MARK: - Priority

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

// MARK: - Hex colours

extension Color {
    /// "#rrggbb" or "#rrggbbaa" → Color. Falls back to gray for malformed input.
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
        guard s.count == 6 || s.count == 8, let v = UInt64(s, radix: 16) else {
            self.init(white: 0.5, alpha: 1)
            return
        }
        let rgba = s.count == 8 ? v : (v << 8) | 0xff
        self.init(
            red: CGFloat((rgba >> 24) & 0xff) / 255,
            green: CGFloat((rgba >> 16) & 0xff) / 255,
            blue: CGFloat((rgba >> 8) & 0xff) / 255,
            alpha: CGFloat(rgba & 0xff) / 255
        )
    }
}
