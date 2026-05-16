import AppKit
import AVFoundation
import Foundation
import TeslaCamCore

enum VideoLayoutMode: String, CaseIterable, Identifiable {
    case studio
    case triptych
    case theater

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .studio: "Studio"
        case .triptych: "3-Up"
        case .theater: "Theater"
        }
    }

    var symbolName: String {
        switch self {
        case .studio: "rectangle.split.2x2"
        case .triptych: "rectangle.split.3x1"
        case .theater: "rectangle.leadingthird.inset.filled"
        }
    }
}

enum PlaybackAdvanceScope: String, CaseIterable, Identifiable {
    case event
    case day
    case library

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .event: "Event"
        case .day: "Day"
        case .library: "All"
        }
    }

    var symbolName: String {
        switch self {
        case .event: "film.stack"
        case .day: "calendar.day.timeline.left"
        case .library: "infinity.circle"
        }
    }
}

enum VideoRenderMode: String, CaseIterable, Identifiable {
    case performance
    case allCameras

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .performance: "Fast"
        case .allCameras: "All Cameras"
        }
    }

    var symbolName: String {
        switch self {
        case .performance: "bolt.fill"
        case .allCameras: "rectangle.grid.2x2"
        }
    }
}

@MainActor
final class PlaybackCoordinator: ObservableObject {
    @Published private(set) var players: [CameraKind: AVPlayer] = [:]
    @Published private(set) var currentSegment: ClipSegment?
    @Published var isPlaying = false
    @Published var duration: Double = 60
    @Published var playbackRate: Float = 1
    @Published var focusedCamera: CameraKind?
    @Published var layoutMode: VideoLayoutMode = .studio
    @Published var renderMode: VideoRenderMode = .performance {
        didSet {
            guard oldValue != renderMode else { return }
            lastKnownTime = currentTime
            applyRenderModePolicy(seekActive: true)
        }
    }
    @Published var advanceScope: PlaybackAdvanceScope = .day
    @Published var wrapsAtScopeEnd = false
    @Published var statusMessage: String?
    @Published var rangeStart: Double?
    @Published var rangeEnd: Double?
    @Published private(set) var timelineRevision = 0

    var onSegmentEnded: (() -> Bool)?

    private var endObservers: [ObjectIdentifier: NSObjectProtocol] = [:]
    private var loadedSegmentFingerprint: String?
    private var lastKnownTime: Double = 0

    var currentTime: Double {
        liveCurrentTime() ?? lastKnownTime
    }

    func renderedPlayer(for camera: CameraKind) -> AVPlayer? {
        guard isCameraRendered(camera) else { return nil }
        return players[camera]
    }

    func isCameraRendered(_ camera: CameraKind) -> Bool {
        activePlaybackCameras().contains(camera)
    }

    func hasVideo(for camera: CameraKind) -> Bool {
        currentSegment?.videos[camera] != nil
    }

    func load(segment: ClipSegment?) {
        let nextFingerprint = segment.map(fingerprint)
        guard loadedSegmentFingerprint != nextFingerprint else { return }
        let shouldResume = isPlaying
        clearPlayers()
        currentSegment = segment
        loadedSegmentFingerprint = nextFingerprint
        lastKnownTime = 0
        timelineRevision &+= 1
        duration = 60
        isPlaying = false
        statusMessage = nil

        guard let segment else { return }

        focusedCamera = focusedCamera.flatMap { segment.videos[$0] == nil ? nil : $0 }
        ensurePlayers(for: activePlaybackCameras())
        loadDuration(for: segment)

        if shouldResume {
            play()
        }
    }

    func togglePlayPause() {
        isPlaying ? pause() : play()
    }

    func play() {
        let startTime = currentTime
        ensurePlayers(for: activePlaybackCameras())
        guard !players.isEmpty else { return }
        if startTime >= max(duration - 0.25, 0.25) {
            if onSegmentEnded?() == true {
                statusMessage = "Advancing to next clip"
                isPlaying = true
                return
            }
            statusMessage = "End of \(advanceScope.displayName.lowercased())"
            pause()
            return
        }
        playActivePlayers(at: startTime)
        isPlaying = true
    }

    func pause() {
        lastKnownTime = currentTime
        players.values.forEach { $0.pause() }
        isPlaying = false
        timelineRevision &+= 1
    }

    func seek(to seconds: Double, exact: Bool = false) {
        let bounded = min(max(seconds, 0), max(duration, 1))
        let time = CMTime(seconds: bounded, preferredTimescale: 600)
        let tolerance = exact ? CMTime.zero : CMTime(seconds: 0.12, preferredTimescale: 600)
        let targetCameras = seekTargetCameras()
        ensurePlayers(for: targetCameras)
        for camera in targetCameras {
            players[camera]?.seek(to: time, toleranceBefore: tolerance, toleranceAfter: tolerance)
        }
        lastKnownTime = bounded
        timelineRevision &+= 1
        if isPlaying {
            playActivePlayers(at: bounded)
        }
    }

    func nudge(seconds: Double) {
        seek(to: currentTime + seconds)
    }

    func stepFrame(direction: Int) {
        pause()
        seek(to: currentTime + (Double(direction) / 30.0), exact: true)
    }

    func setPlaybackRate(_ value: Float) {
        playbackRate = value
        if isPlaying {
            ensurePlayers(for: activePlaybackCameras())
            for camera in activePlaybackCameras() {
                players[camera]?.rate = value
            }
        }
    }

    func markRangeStart() {
        rangeStart = currentTime
        if let rangeEnd, rangeEnd < currentTime {
            self.rangeEnd = nil
        }
    }

    func markRangeEnd() {
        rangeEnd = currentTime
        if let rangeStart, rangeStart > currentTime {
            self.rangeStart = nil
        }
    }

    func clearRange() {
        rangeStart = nil
        rangeEnd = nil
    }

    func toggleFocus(_ camera: CameraKind) {
        lastKnownTime = currentTime
        focusedCamera = focusedCamera == camera ? nil : camera
        applyRenderModePolicy(seekActive: true)
    }

    func revealCurrentSegmentInFinder() {
        let urls = currentSegment?.availableCameras.compactMap { currentSegment?.videos[$0]?.url } ?? []
        guard !urls.isEmpty else { return }
        NSWorkspace.shared.activateFileViewerSelecting(urls)
    }

    func exportSnapshots() async {
        do {
            let folder = try makeSnapshots()
            statusMessage = "Snapshots saved to \(folder.lastPathComponent)"
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func exportEvent(_ event: ClipEvent) {
        do {
            let folder = try copyEventFiles(event)
            NSWorkspace.shared.activateFileViewerSelecting([folder])
            statusMessage = "Event exported to \(folder.lastPathComponent)"
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func exportSelectedSegment() {
        do {
            let folder = try copySelectedSegmentFiles()
            NSWorkspace.shared.activateFileViewerSelecting([folder])
            statusMessage = "Segment exported to \(folder.lastPathComponent)"
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func exportIncidentReport(event: ClipEvent, segment: ClipSegment?) {
        do {
            let url = try makeIncidentReport(event: event, segment: segment)
            NSWorkspace.shared.activateFileViewerSelecting([url])
            statusMessage = "Report exported"
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func installEndObserver(for item: AVPlayerItem) {
        let key = ObjectIdentifier(item)
        guard endObservers[key] == nil else { return }
        let token = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.isPlaying else { return }
                if self.onSegmentEnded?() != true {
                    self.pause()
                    self.seek(to: self.duration)
                }
            }
        }
        endObservers[key] = token
    }

    private func removeEndObserver(for player: AVPlayer) {
        guard let item = player.currentItem else { return }
        let key = ObjectIdentifier(item)
        guard let token = endObservers.removeValue(forKey: key) else { return }
        NotificationCenter.default.removeObserver(token)
    }

    private func loadDuration(for segment: ClipSegment) {
        let segmentFingerprint = loadedSegmentFingerprint
        let assets = segment.videos.values.map { AVURLAsset(url: $0.url) }

        Task { @MainActor in
            var longest = 0.0
            for asset in assets {
                if let duration = try? await asset.load(.duration) {
                    let seconds = duration.seconds
                    if seconds.isFinite {
                        longest = max(longest, seconds)
                    }
                }
            }

            guard self.loadedSegmentFingerprint == segmentFingerprint else { return }
            self.duration = max(1, longest == 0 ? 60 : longest)
        }
    }

    private func fingerprint(for segment: ClipSegment) -> String {
        let videoIDs = segment.availableCameras.compactMap { segment.videos[$0]?.id }.joined(separator: "|")
        return "\(segment.id)|\(videoIDs)"
    }

    private func clearPlayers() {
        lastKnownTime = currentTime
        for token in endObservers.values {
            NotificationCenter.default.removeObserver(token)
        }
        endObservers.removeAll()
        players.values.forEach { $0.pause() }
        players.removeAll()
    }

    private func playActivePlayers(at seconds: Double) {
        let activeCameras = activePlaybackCameras()
        ensurePlayers(for: activeCameras)
        synchronizePlayers(to: seconds, cameras: activeCameras, exact: false)
        for (camera, player) in players {
            if activeCameras.contains(camera) {
                player.playImmediately(atRate: playbackRate)
            } else {
                player.pause()
            }
        }
    }

    private func applyRenderModePolicy(seekActive: Bool) {
        let activeCameras = activePlaybackCameras()
        ensurePlayers(for: activeCameras)
        if renderMode == .performance {
            unloadInactivePlayers(keeping: activeCameras)
        }

        guard !players.isEmpty else { return }
        if seekActive {
            synchronizePlayers(to: lastKnownTime, cameras: activeCameras, exact: false)
        }

        for (camera, player) in players {
            if activeCameras.contains(camera) {
                if isPlaying {
                    player.playImmediately(atRate: playbackRate)
                }
            } else {
                player.pause()
            }
        }
    }

    private func seekTargetCameras() -> Set<CameraKind> {
        switch renderMode {
        case .allCameras:
            Set(currentSegment?.availableCameras ?? players.keys.sorted())
        case .performance:
            activePlaybackCameras()
        }
    }

    private func activePlaybackCameras() -> Set<CameraKind> {
        switch renderMode {
        case .allCameras:
            Set(currentSegment?.availableCameras ?? players.keys.sorted())
        case .performance:
            primaryPlaybackCamera().map { [$0] } ?? []
        }
    }

    private func primaryPlaybackCamera() -> CameraKind? {
        if let focusedCamera, currentSegment?.videos[focusedCamera] != nil {
            return focusedCamera
        }

        let cameras = currentSegment?.availableCameras ?? players.keys.sorted()
        return cameras.first { $0 == .front }
            ?? cameras.first { $0 == .main }
            ?? cameras.first
            ?? players.keys.sorted().first
    }

    private func ensurePlayers(for cameras: Set<CameraKind>) {
        guard let segment = currentSegment else { return }
        var updated = players
        var didChange = false

        for camera in cameras {
            guard updated[camera] == nil,
                  let video = segment.videos[camera] else { continue }
            updated[camera] = makePlayer(for: video)
            didChange = true
        }

        if didChange {
            players = updated
        }
    }

    private func unloadInactivePlayers(keeping activeCameras: Set<CameraKind>) {
        let inactive = Set(players.keys).subtracting(activeCameras)
        guard !inactive.isEmpty else { return }

        var updated = players
        for camera in inactive {
            guard let player = updated.removeValue(forKey: camera) else { continue }
            player.pause()
            removeEndObserver(for: player)
        }
        players = updated
    }

    private func makePlayer(for video: ClipVideo) -> AVPlayer {
        let asset = AVURLAsset(url: video.url)
        let item = AVPlayerItem(asset: asset)
        item.preferredForwardBufferDuration = 1

        let player = AVPlayer(playerItem: item)
        player.actionAtItemEnd = .pause
        player.automaticallyWaitsToMinimizeStalling = false
        player.preventsDisplaySleepDuringVideoPlayback = true
        installEndObserver(for: item)
        return player
    }

    private func synchronizePlayers(to seconds: Double, cameras: Set<CameraKind>, exact: Bool) {
        let target = CMTime(seconds: seconds, preferredTimescale: 600)
        let tolerance = exact ? CMTime.zero : CMTime(seconds: 0.12, preferredTimescale: 600)
        for camera in cameras {
            guard let player = players[camera] else { continue }
            let playerSeconds = player.currentTime().seconds
            guard playerSeconds.isFinite else { continue }
            if abs(playerSeconds - seconds) > 0.18 {
                player.seek(to: target, toleranceBefore: tolerance, toleranceAfter: tolerance)
            }
        }
    }

    private func liveCurrentTime() -> Double? {
        guard let camera = primaryPlaybackCamera(), let player = players[camera] else { return nil }
        let seconds = player.currentTime().seconds
        return seconds.isFinite ? seconds : nil
    }

    private func makeSnapshots() throws -> URL {
        guard let segment = currentSegment else { throw ExportError.noSegment }
        let folder = try desktopFolder("TeslaCamSnapshots")
            .appendingPathComponent(DateFormatterCache.exportStamp.string(from: segment.timestamp), isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

        for camera in segment.availableCameras {
            guard let video = segment.videos[camera] else { continue }
            let generator = AVAssetImageGenerator(asset: AVURLAsset(url: video.url))
            generator.appliesPreferredTrackTransform = true
            generator.requestedTimeToleranceBefore = .zero
            generator.requestedTimeToleranceAfter = .zero
            let image = try generator.copyCGImage(at: CMTime(seconds: currentTime, preferredTimescale: 600), actualTime: nil)
            let representation = NSBitmapImageRep(cgImage: image)
            guard let data = representation.representation(using: .png, properties: [:]) else {
                throw ExportError.imageEncoding
            }
            let destination = folder.appendingPathComponent("\(DateFormatterCache.exportStamp.string(from: segment.timestamp))-\(camera.rawValue).png")
            try data.write(to: destination, options: .atomic)
        }

        return folder
    }

    private func copyEventFiles(_ event: ClipEvent) throws -> URL {
        let folder = try desktopFolder("TeslaCamExports")
            .appendingPathComponent(safeFileName(event.title), isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        for segment in event.segments {
            try copyFiles(from: segment, to: folder)
        }
        return folder
    }

    private func copySelectedSegmentFiles() throws -> URL {
        guard let segment = currentSegment else { throw ExportError.noSegment }
        let folder = try desktopFolder("TeslaCamExports")
            .appendingPathComponent("Segment-\(DateFormatterCache.exportStamp.string(from: segment.timestamp))", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try copyFiles(from: segment, to: folder)
        return folder
    }

    private func copyFiles(from segment: ClipSegment, to folder: URL) throws {
        let fileManager = FileManager.default
        for camera in segment.availableCameras {
            guard let source = segment.videos[camera]?.url else { continue }
            let destination = folder.appendingPathComponent(source.lastPathComponent)
            if fileManager.fileExists(atPath: destination.path) {
                try fileManager.removeItem(at: destination)
            }
            try fileManager.copyItem(at: source, to: destination)
        }
    }

    private func makeIncidentReport(event: ClipEvent, segment: ClipSegment?) throws -> URL {
        let folder = try desktopFolder("TeslaCamReports")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let destination = folder.appendingPathComponent("\(safeFileName(event.title))-report.md")

        var lines: [String] = []
        lines.append("# TeslaCam Incident Report")
        lines.append("")
        lines.append("- Event: \(event.title)")
        lines.append("- Type: \(event.category.displayName)")
        lines.append("- Time: \(event.startDate.formatted(date: .complete, time: .standard))")
        lines.append("- Segments: \(event.segments.count)")
        lines.append("- Video files: \(event.clipCount)")
        lines.append("- Source: \(event.sourceURL.path)")

        if let metadata = event.metadata {
            lines.append("")
            lines.append("## Event Metadata")
            if let city = metadata.city { lines.append("- City: \(city)") }
            if let reason = metadata.formattedReason { lines.append("- Reason: \(reason)") }
            if let timestamp = metadata.timestamp { lines.append("- Metadata timestamp: \(timestamp.formatted(date: .complete, time: .standard))") }
            if let latitude = metadata.estimatedLatitude, let longitude = metadata.estimatedLongitude {
                lines.append("- Coordinates: \(latitude), \(longitude)")
                lines.append("- Apple Maps: https://maps.apple.com/?ll=\(latitude),\(longitude)")
            }
        }

        if let segment {
            lines.append("")
            lines.append("## Selected Segment")
            lines.append("- Segment time: \(segment.timestamp.formatted(date: .complete, time: .standard))")
            if let rangeStart { lines.append("- In point: \(formatTime(rangeStart))") }
            if let rangeEnd { lines.append("- Out point: \(formatTime(rangeEnd))") }
            for camera in segment.availableCameras {
                if let video = segment.videos[camera] {
                    lines.append("- \(camera.displayName): \(video.url.lastPathComponent) (\(ByteCountFormatter.fileSize.string(fromByteCount: video.byteCount)))")
                }
            }
        }

        try lines.joined(separator: "\n").write(to: destination, atomically: true, encoding: .utf8)
        return destination
    }

    private func desktopFolder(_ name: String) throws -> URL {
        guard let desktop = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask).first else {
            throw ExportError.noDesktop
        }
        return desktop.appendingPathComponent(name, isDirectory: true)
    }

    private func safeFileName(_ value: String) -> String {
        let invalid = CharacterSet(charactersIn: "/\\:?%*|\"<>")
        return value.components(separatedBy: invalid).joined(separator: "-")
    }

    enum ExportError: LocalizedError {
        case noSegment
        case noDesktop
        case imageEncoding

        var errorDescription: String? {
            switch self {
            case .noSegment: "No segment selected"
            case .noDesktop: "Desktop folder is not available"
            case .imageEncoding: "Could not encode snapshot"
            }
        }
    }
}
