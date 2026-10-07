import Foundation

struct APIError: LocalizedError {
    let status: Int
    let message: String

    var errorDescription: String? { message }
    var isUnauthorized: Bool { status == 401 }
}

/// Thin JSON client for the Cumin Go API. Sends the session token as `Authorization: Bearer`.
final class APIClient {
    let baseURL: URL
    var token: String?

    private let session: URLSession
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = APIClient.isoFractional.date(from: raw) ?? APIClient.iso.date(from: raw) {
                return date
            }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad date: \(raw)"))
        }
        return d
    }()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()

    // Go's time.Time marshals as RFC 3339, with fractional seconds when non-zero.
    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let iso = ISO8601DateFormatter()

    init(baseURL: URL = AppConfig.apiBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func get<Res: Decodable>(_ path: String) async throws -> Res {
        try await send("GET", path, body: Optional<Empty>.none)
    }

    func post<Res: Decodable>(_ path: String, body: some Encodable) async throws -> Res {
        try await send("POST", path, body: body)
    }

    func send<Res: Decodable, Body: Encodable>(_ method: String, _ path: String, body: Body?) async throws -> Res {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error ?? "Request failed (\(status))"
            throw APIError(status: status, message: message)
        }
        if Res.self == Empty.self || data.isEmpty {
            return Empty() as! Res
        }
        return try decoder.decode(Res.self, from: data)
    }

    struct Empty: Codable {}
    private struct ErrorBody: Decodable { let error: String }
}
