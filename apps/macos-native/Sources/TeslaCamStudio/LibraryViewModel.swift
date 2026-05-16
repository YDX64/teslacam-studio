import AppKit
import Foundation
import TeslaCamCore

struct DayTimelineItem: Identifiable, Hashable {
    let id: String
    let event: ClipEvent
    let segment: ClipSegment
}

@MainActor
final class LibraryViewModel: ObservableObject {
    @Published private(set) var snapshot: TeslaCamLibrarySnapshot?
    @Published var rootURL: URL
    @Published var selectedCategory: ClipCategory? {
        didSet { rebuildDerivedState() }
    }
    @Published var selectedDay: Date? {
        didSet { rebuildDerivedState() }
    }
    @Published var searchText = "" {
        didSet { rebuildDerivedState() }
    }
    @Published var selectedEventID: ClipEvent.ID?
    @Published var selectedSegmentID: ClipSegment.ID?
    @Published private(set) var isScanning = false
    @Published var scanError: String?
    @Published private(set) var filteredEvents: [ClipEvent] = []
    @Published private(set) var availableDays: [Date] = []
    @Published private(set) var dayTimelineItems: [DayTimelineItem] = []
    @Published private(set) var libraryTimelineItems: [DayTimelineItem] = []

    private let scanner = TeslaCamScanner()

    init(rootURL: URL) {
        self.rootURL = rootURL
    }

    var selectedEvent: ClipEvent? {
        guard let id = selectedEventID else { return filteredEvents.first ?? snapshot?.events.first }
        return snapshot?.events.first { $0.id == id }
    }

    var selectedSegment: ClipSegment? {
        guard let event = selectedEvent else { return nil }
        if let selectedSegmentID,
           let segment = event.segments.first(where: { $0.id == selectedSegmentID }) {
            return segment
        }
        return event.segments.first
    }

    func reload() {
        Task {
            await scan()
        }
    }

    func scan() async {
        isScanning = true
        scanError = nil
        do {
            let result = try await scanner.scan(rootURL: rootURL)
            apply(snapshot: result)
        } catch {
            snapshot = nil
            filteredEvents = []
            availableDays = []
            dayTimelineItems = []
            libraryTimelineItems = []
            scanError = error.localizedDescription
        }
        isScanning = false
    }

    func presentFolderPicker() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.directoryURL = rootURL
        if panel.runModal() == .OK, let url = panel.url {
            rootURL = url
            reload()
        }
    }

    func select(event: ClipEvent) {
        selectedEventID = event.id
        selectedSegmentID = event.segments.first?.id
        selectedDay = Calendar.app.startOfDay(for: event.startDate)
    }

    func select(segment: ClipSegment, in event: ClipEvent? = nil) {
        if let event {
            selectedEventID = event.id
        }
        selectedSegmentID = segment.id
    }

    func selectTimelineItem(_ item: DayTimelineItem) {
        selectedEventID = item.event.id
        selectedSegmentID = item.segment.id
        selectedDay = Calendar.app.startOfDay(for: item.event.startDate)
    }

    @discardableResult
    func selectFirstSegment(scope: PlaybackAdvanceScope) -> Bool {
        let events = eventsFor(scope: scope)
        guard let first = events.first, let segment = first.segments.first else { return false }
        let changed = selectedEventID != first.id || selectedSegmentID != segment.id
        selectedEventID = first.id
        selectedSegmentID = segment.id
        selectedDay = Calendar.app.startOfDay(for: first.startDate)
        return changed
    }

    @discardableResult
    func selectNextSegment(scope: PlaybackAdvanceScope, wrap: Bool) -> Bool {
        selectAdjacentSegment(delta: 1, scope: scope, wrap: wrap)
    }

    @discardableResult
    func selectPreviousSegment(scope: PlaybackAdvanceScope, wrap: Bool) -> Bool {
        selectAdjacentSegment(delta: -1, scope: scope, wrap: wrap)
    }

    private func selectAdjacentSegment(delta: Int, scope: PlaybackAdvanceScope, wrap: Bool) -> Bool {
        let sequence = segmentSequence(scope: scope)
        guard !sequence.isEmpty else { return false }
        guard let currentEventID = selectedEventID, let currentSegmentID = selectedSegmentID,
              let currentIndex = sequence.firstIndex(where: { $0.event.id == currentEventID && $0.segment.id == currentSegmentID }) else {
            let first = sequence.first!
            selectedEventID = first.event.id
            selectedSegmentID = first.segment.id
            selectedDay = Calendar.app.startOfDay(for: first.event.startDate)
            return true
        }

        var nextIndex = currentIndex + delta
        if nextIndex < 0 || nextIndex >= sequence.count {
            guard wrap else { return false }
            nextIndex = nextIndex < 0 ? sequence.count - 1 : 0
        }

        let next = sequence[nextIndex]
        selectedEventID = next.event.id
        selectedSegmentID = next.segment.id
        selectedDay = Calendar.app.startOfDay(for: next.event.startDate)
        return true
    }

    private func segmentSequence(scope: PlaybackAdvanceScope) -> [DayTimelineItem] {
        eventsFor(scope: scope).flatMap { event in
            event.segments.map { segment in
                DayTimelineItem(id: "\(event.id)#\(segment.id)", event: event, segment: segment)
            }
        }
    }

    private func eventsFor(scope: PlaybackAdvanceScope) -> [ClipEvent] {
        guard let snapshot else { return [] }
        switch scope {
        case .event:
            return selectedEvent.map { [$0] } ?? []
        case .day:
            guard let selectedDay else { return [] }
            return snapshot.events
                .filter { Calendar.app.isDate($0.startDate, inSameDayAs: selectedDay) }
                .sorted { $0.startDate < $1.startDate }
        case .library:
            return snapshot.events.sorted { $0.startDate < $1.startDate }
        }
    }

    private func apply(snapshot: TeslaCamLibrarySnapshot) {
        self.snapshot = snapshot
        availableDays = snapshot.availableDays
        if selectedDay == nil {
            selectedDay = availableDays.first
        }
        rebuildDerivedState()
        if selectedEventID == nil || selectedEvent == nil {
            selectedEventID = filteredEvents.first?.id ?? snapshot.events.first?.id
        }
        selectedSegmentID = selectedEvent?.segments.first?.id
    }

    private func rebuildDerivedState() {
        guard let snapshot else {
            filteredEvents = []
            availableDays = []
            dayTimelineItems = []
            libraryTimelineItems = []
            return
        }

        availableDays = snapshot.availableDays
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        filteredEvents = snapshot.events.filter { event in
            let categoryMatch = selectedCategory == nil || event.category == selectedCategory
            let dayMatch = selectedDay == nil || Calendar.app.isDate(event.startDate, inSameDayAs: selectedDay!)
            let searchMatch: Bool
            if query.isEmpty {
                searchMatch = true
            } else {
                let haystack = [
                    event.title,
                    event.category.displayName,
                    event.metadata?.city ?? "",
                    event.metadata?.formattedReason ?? "",
                    event.sourceURL.path
                ].joined(separator: " ").lowercased()
                searchMatch = haystack.contains(query)
            }
            return categoryMatch && dayMatch && searchMatch
        }

        let day = selectedDay ?? selectedEvent.map { Calendar.app.startOfDay(for: $0.startDate) }
        dayTimelineItems = snapshot.events
            .filter { event in
                guard let day else { return false }
                return Calendar.app.isDate(event.startDate, inSameDayAs: day)
            }
            .sorted { $0.startDate < $1.startDate }
            .flatMap { event in
                event.segments.map { DayTimelineItem(id: "\(event.id)#\($0.id)", event: event, segment: $0) }
            }

        libraryTimelineItems = snapshot.events
            .sorted { $0.startDate < $1.startDate }
            .flatMap { event in
                event.segments.map { DayTimelineItem(id: "\(event.id)#\($0.id)", event: event, segment: $0) }
            }
    }
}

enum StartupRootResolver {
    static func resolve() -> URL {
        let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
        if FileManager.default.fileExists(atPath: cwd.appendingPathComponent("RecentClips").path) ||
            FileManager.default.fileExists(atPath: cwd.appendingPathComponent("SentryClips").path) {
            return cwd
        }
        return URL(fileURLWithPath: "/Users/max/Downloads/TeslaCam", isDirectory: true)
    }
}
