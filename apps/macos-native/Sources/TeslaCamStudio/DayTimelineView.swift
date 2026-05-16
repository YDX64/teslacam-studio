import AppKit
import SwiftUI
import TeslaCamCore

struct DayTimelineView: View {
    @EnvironmentObject private var library: LibraryViewModel
    @EnvironmentObject private var bookmarks: BookmarkStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Label("Day Timeline", systemImage: "timeline.selection")
                    .font(.headline)
                Text(library.selectedDay?.formatted(date: .abbreviated, time: .omitted) ?? "No day")
                    .foregroundStyle(.secondary)
                Spacer()
                LegendDot(color: .teal, label: "Recent")
                LegendDot(color: .orange, label: "Saved")
                LegendDot(color: .red, label: "Sentry")
                LegendDot(color: .purple, label: "Issue")
            }

            AppKitTimelineView(
                items: library.dayTimelineItems,
                selectedSegmentID: library.selectedSegmentID,
                bookmarkedKeys: bookmarks.keys,
                selectItem: { item in
                    library.selectTimelineItem(item)
                }
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

private struct LegendDot: View {
    let color: Color
    let label: String

    var body: some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2)
                .fill(color)
                .frame(width: 10, height: 10)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private struct AppKitTimelineView: NSViewRepresentable {
    let items: [DayTimelineItem]
    let selectedSegmentID: ClipSegment.ID?
    let bookmarkedKeys: Set<String>
    let selectItem: (DayTimelineItem) -> Void

    func makeNSView(context: Context) -> TimelineHostView {
        TimelineHostView()
    }

    func updateNSView(_ nsView: TimelineHostView, context: Context) {
        nsView.items = items
        nsView.selectedSegmentID = selectedSegmentID
        nsView.bookmarkedKeys = bookmarkedKeys
        nsView.selectItem = selectItem
        nsView.needsDisplay = true
    }
}

private final class TimelineHostView: NSView {
    var items: [DayTimelineItem] = []
    var selectedSegmentID: ClipSegment.ID?
    var bookmarkedKeys: Set<String> = []
    var selectItem: ((DayTimelineItem) -> Void)?

    private let calendar = Calendar.current

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.withAlphaComponent(0.08).cgColor
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard let context = NSGraphicsContext.current?.cgContext else { return }

        let bounds = self.bounds.insetBy(dx: 0, dy: 2)
        let axisTop = bounds.minY + 14
        let axisBottom = bounds.maxY - 22

        context.setStrokeColor(NSColor.separatorColor.withAlphaComponent(0.4).cgColor)
        context.setLineWidth(1)

        let labelAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedDigitSystemFont(ofSize: 10, weight: .regular),
            .foregroundColor: NSColor.secondaryLabelColor
        ]

        for hour in 0...24 {
            let x = bounds.minX + bounds.width * CGFloat(hour) / 24.0
            context.move(to: CGPoint(x: x, y: axisTop))
            context.addLine(to: CGPoint(x: x, y: axisBottom))
            context.strokePath()

            if hour < 24, hour % 1 == 0 {
                let label = String(format: "%02d:00", hour)
                label.draw(at: CGPoint(x: x + 4, y: bounds.maxY - 16), withAttributes: labelAttributes)
            }
        }

        for item in items {
            let minute = minuteOfDay(item.segment.timestamp)
            let x = bounds.minX + bounds.width * CGFloat(minute) / 1440.0
            let width = max(5, bounds.width / 1440.0 * 4)
            let y = axisTop + 16
            let rect = CGRect(x: x, y: y, width: width, height: max(18, axisBottom - y - 4))
            let path = CGPath(roundedRect: rect, cornerWidth: 4, cornerHeight: 4, transform: nil)
            context.setFillColor(nsColor(for: item.event.category).cgColor)
            context.addPath(path)
            context.fillPath()

            if item.segment.id == selectedSegmentID {
                context.setStrokeColor(NSColor.controlAccentColor.cgColor)
                context.setLineWidth(3)
                context.addPath(CGPath(roundedRect: rect.insetBy(dx: -3, dy: -3), cornerWidth: 5, cornerHeight: 5, transform: nil))
                context.strokePath()
            }

            if bookmarkedKeys.contains(item.id) {
                context.setFillColor(NSColor.white.cgColor)
                context.fillEllipse(in: CGRect(x: x + width + 2, y: y - 3, width: 6, height: 6))
            }
        }
    }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        guard let item = nearestItem(to: point) else { return }
        selectItem?(item)
    }

    private func nearestItem(to point: CGPoint) -> DayTimelineItem? {
        guard !items.isEmpty else { return nil }
        let minute = Double((point.x / max(bounds.width, 1)) * 1440)
        return items.min { lhs, rhs in
            abs(Double(minuteOfDay(lhs.segment.timestamp)) - minute) < abs(Double(minuteOfDay(rhs.segment.timestamp)) - minute)
        }
    }

    private func minuteOfDay(_ date: Date) -> Int {
        let components = calendar.dateComponents([.hour, .minute], from: date)
        return (components.hour ?? 0) * 60 + (components.minute ?? 0)
    }

    private func nsColor(for category: ClipCategory) -> NSColor {
        switch category {
        case .recent: .systemTeal
        case .saved: .systemOrange
        case .sentry: .systemRed
        case .unknown: .systemGray
        }
    }
}
