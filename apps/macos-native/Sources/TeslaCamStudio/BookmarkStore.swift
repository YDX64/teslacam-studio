import Foundation
import TeslaCamCore

@MainActor
final class BookmarkStore: ObservableObject {
    @Published private(set) var keys: Set<String>

    private let defaultsKey = "TeslaCamStudio.bookmarks"

    init() {
        let values = UserDefaults.standard.stringArray(forKey: defaultsKey) ?? []
        keys = Set(values)
    }

    func key(event: ClipEvent, segment: ClipSegment) -> String {
        "\(event.id)#\(segment.id)"
    }

    func isBookmarked(event: ClipEvent, segment: ClipSegment) -> Bool {
        keys.contains(key(event: event, segment: segment))
    }

    func toggle(event: ClipEvent, segment: ClipSegment) {
        let bookmarkKey = key(event: event, segment: segment)
        if keys.contains(bookmarkKey) {
            keys.remove(bookmarkKey)
        } else {
            keys.insert(bookmarkKey)
        }
        UserDefaults.standard.set(Array(keys).sorted(), forKey: defaultsKey)
    }

    func count(in event: ClipEvent) -> Int {
        event.segments.filter { keys.contains(key(event: event, segment: $0)) }.count
    }
}
