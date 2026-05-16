import Foundation

public struct TeslaCamScanner: @unchecked Sendable {
    private let fileManager: FileManager

    public init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    public func scan(rootURL: URL) async throws -> TeslaCamLibrarySnapshot {
        let root = rootURL.standardizedFileURL
        var events: [ClipEvent] = []

        let recentURL = root.appendingPathComponent("RecentClips", isDirectory: true)
        if fileManager.fileExists(atPath: recentURL.path) {
            events.append(contentsOf: try scanFlatFolder(recentURL, category: .recent))
        }

        let savedURL = root.appendingPathComponent("SavedClips", isDirectory: true)
        if fileManager.fileExists(atPath: savedURL.path) {
            events.append(contentsOf: try scanEventFolders(savedURL, category: .saved))
        }

        let sentryURL = root.appendingPathComponent("SentryClips", isDirectory: true)
        if fileManager.fileExists(atPath: sentryURL.path) {
            events.append(contentsOf: try scanEventFolders(sentryURL, category: .sentry))
        }

        let known = Set([recentURL.standardizedFileURL, savedURL.standardizedFileURL, sentryURL.standardizedFileURL].map(\.path))
        let genericVideos = try videoFiles(in: root, recursive: false)
            .filter { file in
                !known.contains(file.deletingLastPathComponent().standardizedFileURL.path)
            }
        if !genericVideos.isEmpty {
            events.append(contentsOf: makeEvents(from: genericVideos, category: .unknown, sourceURL: root, metadata: nil))
        }

        events.sort {
            if $0.startDate == $1.startDate { return $0.title < $1.title }
            return $0.startDate > $1.startDate
        }

        return TeslaCamLibrarySnapshot(rootURL: root, events: events)
    }

    private func scanEventFolders(_ parent: URL, category: ClipCategory) throws -> [ClipEvent] {
        let folders = try fileManager.contentsOfDirectory(
            at: parent,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        )
        .filter { url in
            (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
        }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }

        return try folders.compactMap { folder in
            let metadata = parseMetadata(in: folder)
            let videos = try videoFiles(in: folder, recursive: false)
            return makeEvents(from: videos, category: category, sourceURL: folder, metadata: metadata).first
        }
    }

    private func scanFlatFolder(_ folder: URL, category: ClipCategory) throws -> [ClipEvent] {
        let videos = try videoFiles(in: folder, recursive: false)
        return makeEvents(from: videos, category: category, sourceURL: folder, metadata: nil)
    }

    private func videoFiles(in folder: URL, recursive: Bool) throws -> [URL] {
        let keys: Set<URLResourceKey> = [.isRegularFileKey, .isDirectoryKey, .fileSizeKey, .contentModificationDateKey]
        guard let enumerator = fileManager.enumerator(
            at: folder,
            includingPropertiesForKeys: Array(keys),
            options: [.skipsHiddenFiles]
        ) else {
            return []
        }

        var files: [URL] = []
        for case let url as URL in enumerator {
            let values = try? url.resourceValues(forKeys: keys)
            if values?.isDirectory == true, !recursive {
                enumerator.skipDescendants()
                continue
            }
            guard values?.isRegularFile == true, isVideo(url) else { continue }
            files.append(url.standardizedFileURL)
        }
        return files
    }

    private func makeEvents(
        from files: [URL],
        category: ClipCategory,
        sourceURL: URL,
        metadata: EventMetadata?
    ) -> [ClipEvent] {
        let parsed = files.compactMap(parseVideo).sorted { $0.timestamp < $1.timestamp }
        guard !parsed.isEmpty else { return [] }

        var segmentBuckets: [Date: [CameraKind: ClipVideo]] = [:]
        for item in parsed {
            segmentBuckets[item.timestamp, default: [:]][item.camera] = item.video
        }

        let segments = segmentBuckets.keys.sorted().map { timestamp in
            ClipSegment(
                id: "\(sourceURL.path)#\(timestamp.timeIntervalSince1970)",
                timestamp: timestamp,
                videos: segmentBuckets[timestamp] ?? [:]
            )
        }

        guard !segments.isEmpty else { return [] }

        var grouped: [[ClipSegment]] = []
        var current: [ClipSegment] = []
        for segment in segments {
            if let last = current.last,
               segment.timestamp.timeIntervalSince(last.timestamp) > 125 {
                grouped.append(current)
                current = []
            }
            current.append(segment)
        }
        if !current.isEmpty {
            grouped.append(current)
        }

        return grouped.enumerated().map { index, group in
            let start = group.first?.timestamp ?? .distantPast
            let end = (group.last?.timestamp ?? start).addingTimeInterval(60)
            let title = titleForEvent(
                category: category,
                sourceURL: sourceURL,
                metadata: metadata,
                start: start,
                end: end
            )
            return ClipEvent(
                id: "\(category.rawValue)#\(sourceURL.path)#\(index)#\(start.timeIntervalSince1970)",
                category: category,
                title: title,
                sourceURL: sourceURL,
                metadata: metadata,
                segments: group
            )
        }
    }

    private func parseVideo(_ url: URL) -> ParsedVideo? {
        let name = url.deletingPathExtension().lastPathComponent
        let timestamp: Date
        let cameraToken: String

        if let parsed = parseTeslaTimestamp(from: name) {
            timestamp = parsed.date
            cameraToken = parsed.cameraToken
        } else {
            let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
            timestamp = values?.contentModificationDate ?? Date.distantPast
            cameraToken = name
        }

        let values = try? url.resourceValues(forKeys: [.fileSizeKey])
        let bytes = Int64(values?.fileSize ?? 0)
        let camera = cameraKind(from: cameraToken)
        let video = ClipVideo(url: url, camera: camera, timestamp: timestamp, byteCount: bytes)
        return ParsedVideo(timestamp: timestamp, camera: camera, video: video)
    }

    private func parseTeslaTimestamp(from name: String) -> (date: Date, cameraToken: String)? {
        let pattern = #"^(\d{4})-(\d{2})-(\d{2})[_ -](\d{2})[-:](\d{2})[-:](\d{2})(?:[-_ ](.+))?$"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(name.startIndex..<name.endIndex, in: name)
        guard let match = regex.firstMatch(in: name, range: range), match.numberOfRanges >= 7 else { return nil }

        func string(_ index: Int) -> String? {
            guard index < match.numberOfRanges,
                  let range = Range(match.range(at: index), in: name) else {
                return nil
            }
            return String(name[range])
        }

        guard let year = Int(string(1) ?? ""),
              let month = Int(string(2) ?? ""),
              let day = Int(string(3) ?? ""),
              let hour = Int(string(4) ?? ""),
              let minute = Int(string(5) ?? ""),
              let second = Int(string(6) ?? "") else {
            return nil
        }

        var components = DateComponents()
        components.calendar = Calendar.current
        components.year = year
        components.month = month
        components.day = day
        components.hour = hour
        components.minute = minute
        components.second = second

        guard let date = components.date else { return nil }
        return (date, string(7) ?? name)
    }

    private func parseMetadata(in folder: URL) -> EventMetadata? {
        let url = folder.appendingPathComponent("event.json")
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        func string(_ keys: String...) -> String? {
            for key in keys {
                if let value = object[key] as? String, !value.isEmpty {
                    return value
                }
                if let value = object[key] {
                    let text = "\(value)"
                    if !text.isEmpty { return text }
                }
            }
            return nil
        }

        func double(_ keys: String...) -> Double? {
            for key in keys {
                if let value = object[key] as? Double { return value }
                if let value = object[key] as? Int { return Double(value) }
                if let text = object[key] as? String, let value = Double(text) { return value }
            }
            return nil
        }

        let iso = ISO8601DateFormatter()
        var timestamp: Date?
        if let text = string("timestamp", "event_timestamp", "time") {
            timestamp = iso.date(from: text)
        }

        return EventMetadata(
            city: string("city", "est_city"),
            reason: string("reason"),
            triggerCamera: string("camera", "trigger_camera"),
            timestamp: timestamp,
            estimatedLatitude: double("est_lat", "latitude", "lat"),
            estimatedLongitude: double("est_lon", "longitude", "lon", "lng")
        )
    }

    private func cameraKind(from token: String) -> CameraKind {
        let lower = token.lowercased()
        if lower.contains("left") { return .leftRepeater }
        if lower.contains("right") { return .rightRepeater }
        if lower.contains("front") { return .front }
        if lower.contains("rear") || lower.contains("back") { return .rear }
        if lower.contains("cabin") || lower.contains("interior") { return .cabin }
        if lower.contains("wide") { return .wide }
        if lower.contains("narrow") { return .narrow }
        if lower.contains("fish") { return .fisheye }
        if lower.contains("main") { return .main }
        return .main
    }

    private func isVideo(_ url: URL) -> Bool {
        switch url.pathExtension.lowercased() {
        case "mp4", "mov", "m4v": true
        default: false
        }
    }

    private func titleForEvent(
        category: ClipCategory,
        sourceURL: URL,
        metadata: EventMetadata?,
        start: Date,
        end: Date
    ) -> String {
        if sourceURL.lastPathComponent != "RecentClips",
           sourceURL.lastPathComponent != "SavedClips",
           sourceURL.lastPathComponent != "SentryClips" {
            return sourceURL.lastPathComponent
        }

        let date = start.formatted(date: .abbreviated, time: .omitted)
        let startTime = start.formatted(date: .omitted, time: .shortened)
        let endTime = end.formatted(date: .omitted, time: .shortened)
        if let city = metadata?.city, !city.isEmpty {
            return "\(category.displayName) \(city) \(startTime) - \(endTime)"
        }
        return "\(category.displayName) \(date) at \(startTime) - \(endTime)"
    }

    private struct ParsedVideo {
        let timestamp: Date
        let camera: CameraKind
        let video: ClipVideo
    }
}
