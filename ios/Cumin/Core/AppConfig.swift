import Foundation

enum AppConfig {
    /// Base URL of the Cumin Go server, injected from the xcconfig via Info.plist.
    static let apiBaseURL: URL = {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "CuminAPIBaseURL") as? String,
            let url = URL(string: raw)
        else {
            fatalError("CuminAPIBaseURL missing from Info.plist")
        }
        return url
    }()
}
