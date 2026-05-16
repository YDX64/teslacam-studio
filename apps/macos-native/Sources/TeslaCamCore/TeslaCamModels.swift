import Foundation

public enum ClipCategory: String, CaseIterable, Identifiable, Codable, Sendable {
    case recent
    case saved
    case sentry
    case unknown

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .recent: "Recent"
        case .saved: "Saved"
        case .sentry: "Sentry"
        case .unknown: "Other"
        }
    }

    public var symbolName: String {
        switch self {
        case .recent: "clock.arrow.circlepath"
        case .saved: "bookmark.fill"
        case .sentry: "shield.fill"
        case .unknown: "questionmark.folder"
        }
    }
}

public enum CameraKind: String, CaseIterable, Identifiable, Codable, Sendable, Comparable {
    case front
    case leftRepeater = "left_repeater"
    case rightRepeater = "right_repeater"
    case rear
    case main
    case cabin
    case wide
    case narrow
    case fisheye
    case unknown

    public var id: String { rawValue }

    public static func < (lhs: CameraKind, rhs: CameraKind) -> Bool {
        lhs.sortIndex < rhs.sortIndex
    }

    public var sortIndex: Int {
        switch self {
        case .front: 0
        case .main: 1
        case .leftRepeater: 2
        case .rightRepeater: 3
        case .rear: 4
        case .cabin: 5
        case .wide: 6
        case .narrow: 7
        case .fisheye: 8
        case .unknown: 99
        }
    }

    public var displayName: String {
        switch self {
        case .front: "Front"
        case .leftRepeater: "Left"
        case .rightRepeater: "Right"
        case .rear: "Rear"
        case .main: "Main"
        case .cabin: "Cabin"
        case .wide: "Wide"
        case .narrow: "Narrow"
        case .fisheye: "Fisheye"
        case .unknown: "Camera"
        }
    }

    public var symbolName: String {
        switch self {
        case .front, .main: "car.front.waves.up"
        case .leftRepeater: "arrowshape.left.fill"
        case .rightRepeater: "arrowshape.right.fill"
        case .rear: "car.rear"
        case .cabin: "person.crop.rectangle"
        case .wide: "camera.metering.matrix"
        case .narrow: "camera.metering.center.weighted"
        case .fisheye: "record.circle"
        case .unknown: "video"
        }
    }
}

public struct EventMetadata: Hashable, Codable, Sendable {
    public var city: String?
    public var reason: String?
    public var triggerCamera: String?
    public var timestamp: Date?
    public var estimatedLatitude: Double?
    public var estimatedLongitude: Double?

    public init(
        city: String? = nil,
        reason: String? = nil,
        triggerCamera: String? = nil,
        timestamp: Date? = nil,
        estimatedLatitude: Double? = nil,
        estimatedLongitude: Double? = nil
    ) {
        self.city = city
        self.reason = reason
        self.triggerCamera = triggerCamera
        self.timestamp = timestamp
        self.estimatedLatitude = estimatedLatitude
        self.estimatedLongitude = estimatedLongitude
    }

    public var hasLocation: Bool {
        estimatedLatitude != nil && estimatedLongitude != nil
    }

    public var formattedReason: String? {
        guard let reason, !reason.isEmpty else { return nil }
        return switch reason {
        case "sentry_aware_object_detection": "Sentry object detection"
        case "sentry_aware_accel_primary": "Sentry impact detected"
        case "user_interaction_honk": "Horn save"
        case "user_interaction_dashcam_icon_tapped": "Manual dashcam save"
        case "user_interaction_dashcam_panel_save": "Manual dashcam save"
        default: reason.replacingOccurrences(of: "_", with: " ")
        }
    }
}

public struct ClipVideo: Identifiable, Hashable, Sendable {
    public var id: String { url.path }
    public let url: URL
    public let camera: CameraKind
    public let timestamp: Date
    public let byteCount: Int64

    public init(url: URL, camera: CameraKind, timestamp: Date, byteCount: Int64) {
        self.url = url
        self.camera = camera
        self.timestamp = timestamp
        self.byteCount = byteCount
    }
}

public struct ClipSegment: Identifiable, Hashable, Sendable {
    public let id: String
    public let timestamp: Date
    public let videos: [CameraKind: ClipVideo]

    public init(id: String, timestamp: Date, videos: [CameraKind: ClipVideo]) {
        self.id = id
        self.timestamp = timestamp
        self.videos = videos
    }

    public var availableCameras: [CameraKind] {
        videos.keys.sorted()
    }

    public var totalBytes: Int64 {
        videos.values.reduce(0) { $0 + $1.byteCount }
    }
}

public struct ClipEvent: Identifiable, Hashable, Sendable {
    public let id: String
    public let category: ClipCategory
    public let title: String
    public let sourceURL: URL
    public let metadata: EventMetadata?
    public let segments: [ClipSegment]

    public init(
        id: String,
        category: ClipCategory,
        title: String,
        sourceURL: URL,
        metadata: EventMetadata?,
        segments: [ClipSegment]
    ) {
        self.id = id
        self.category = category
        self.title = title
        self.sourceURL = sourceURL
        self.metadata = metadata
        self.segments = segments
    }

    public var startDate: Date { segments.first?.timestamp ?? .distantPast }
    public var endDate: Date { (segments.last?.timestamp ?? startDate).addingTimeInterval(60) }
    public var clipCount: Int { segments.reduce(0) { $0 + $1.videos.count } }
    public var totalBytes: Int64 { segments.reduce(0) { $0 + $1.totalBytes } }

    public var expectedCoverageCameras: [CameraKind] {
        let cameras = Set(segments.flatMap(\.availableCameras))
        if cameras.contains(.front) || cameras.contains(.leftRepeater) || cameras.contains(.rightRepeater) {
            return [.front, .leftRepeater, .rightRepeater].filter { cameras.contains($0) }
        }
        return cameras.sorted()
    }

    public var cameraCoverage: [CameraKind: Int] {
        var counts: [CameraKind: Int] = [:]
        for segment in segments {
            for camera in segment.availableCameras {
                counts[camera, default: 0] += 1
            }
        }
        return counts
    }

    public var missingCameraCount: Int {
        let expected = expectedCoverageCameras
        guard !expected.isEmpty else { return 0 }
        return segments.reduce(0) { total, segment in
            total + expected.filter { segment.videos[$0] == nil }.count
        }
    }
}

public struct TeslaCamLibrarySnapshot: Sendable {
    public let rootURL: URL
    public let events: [ClipEvent]
    public let scannedAt: Date

    public init(rootURL: URL, events: [ClipEvent], scannedAt: Date = Date()) {
        self.rootURL = rootURL
        self.events = events
        self.scannedAt = scannedAt
    }

    public var clipCount: Int {
        events.reduce(0) { $0 + $1.clipCount }
    }

    public var totalBytes: Int64 {
        events.reduce(0) { $0 + $1.totalBytes }
    }

    public var availableDays: [Date] {
        let calendar = Calendar.current
        let days = Set(events.map { calendar.startOfDay(for: $0.startDate) })
        return days.sorted(by: >)
    }
}
