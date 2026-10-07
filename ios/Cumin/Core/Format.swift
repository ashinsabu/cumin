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
}
