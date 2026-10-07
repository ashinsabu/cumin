import Foundation

/// Ports of ui/src/hooks/useFormat.ts.
enum Format {
    /// Coarse duration for time-in-status: 45m, 3h, 2d.
    static func duration(_ minutes: Int) -> String {
        if minutes < 60 { return "\(minutes)m" }
        if minutes < 1440 { return "\(minutes / 60)h" }
        return "\(minutes / 1440)d"
    }

    /// Estimate: 30m, 2h, 1h 30m.
    static func estimate(_ minutes: Int) -> String {
        if minutes < 60 { return "\(minutes)m" }
        if minutes % 60 == 0 { return "\(minutes / 60)h" }
        return "\(minutes / 60)h \(minutes % 60)m"
    }

    /// "2h", "30m", "1h30m", "90m", "1.5h", "2d", "1.5d", "2" (hours) → minutes. nil if unparseable.
    static func parseEstimate(_ raw: String) -> Int? {
        let s = raw.trimmingCharacters(in: .whitespaces).lowercased()
        guard !s.isEmpty else { return nil }
        func match(_ pattern: String) -> [String]? {
            guard let re = try? NSRegularExpression(pattern: pattern),
                  let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s))
            else { return nil }
            return (0..<m.numberOfRanges).map { i in
                Range(m.range(at: i), in: s).map { String(s[$0]) } ?? ""
            }
        }
        if let g = match(#"^(\d+(?:\.\d+)?)d$"#), let d = Double(g[1]) {
            return Int((d * 1440).rounded())
        }
        if let g = match(#"^(\d+(?:\.\d+)?)h(?:(\d+)m)?$"#), let h = Double(g[1]) {
            return Int((h * 60).rounded()) + (Int(g[2]) ?? 0)
        }
        if let g = match(#"^(\d+)m$"#) { return Int(g[1]) }
        if let g = match(#"^(\d+(?:\.\d+)?)$"#), let h = Double(g[1]) {
            return Int((h * 60).rounded())
        }
        return nil
    }
}
