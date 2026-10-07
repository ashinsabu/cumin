import Foundation

/// Mirrors server/auth/user.go.
struct User: Codable, Equatable {
    let id: String
    let email: String
    let displayName: String
    let avatarUrl: String
    let idPrefix: String
    let createdAt: Date
    let updatedAt: Date
}

// Mirrors ui/src/types/index.ts. Unused server fields are ignored by Codable.

struct Board: Codable, Equatable {
    let id: String
    let name: String
    let sprintCadenceDays: Int
    let availableHoursPerSprint: Int
}

struct Status: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let isDone: Bool
    let isInitial: Bool
    let position: Int
}

struct Epic: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let type: String // recurring | goal | catchall
    let color: String
    let deadline: String?
    let description: String
}

struct Sprint: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let startDate: String
    let endDate: String
    let state: String // planning | active | completed
}

struct Item: Codable, Equatable, Identifiable {
    let id: String
    let displayId: String
    var title: String
    var description: String?
    var epicId: String?
    var sprintId: String?
    var projectId: String?
    var priority: Int
    var estimateMinutes: Int?
    var statusId: String
    var position: Int
    // Enriched by the server.
    var epicName: String?
    var epicColor: String?
    var timeInStatusMinutes: Int?
    var deadline: String?
    var sprints: [String]?
}

struct Project: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let prefix: String
    let color: String
}

// List endpoint wrappers: { "statuses": [...] } etc.
struct StatusList: Decodable { let statuses: [Status]? }
struct ItemList: Decodable { let items: [Item]? }
struct EpicList: Decodable { let epics: [Epic]? }
struct ProjectList: Decodable { let projects: [Project]? }
