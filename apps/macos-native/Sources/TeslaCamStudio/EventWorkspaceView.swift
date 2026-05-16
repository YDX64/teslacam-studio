import SwiftUI
import TeslaCamCore

struct EventWorkspaceView: View {
    @EnvironmentObject private var library: LibraryViewModel
    @EnvironmentObject private var playback: PlaybackCoordinator
    @EnvironmentObject private var bookmarks: BookmarkStore

    let event: ClipEvent
    @Binding var showsInspector: Bool

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                EventHeader(event: event)
                    .padding(.horizontal, 18)
                    .padding(.top, 12)
                    .padding(.bottom, 8)

                EventInsightStrip(event: event)
                    .padding(.horizontal, 18)
                    .padding(.bottom, 12)

                Divider()

                VideoGridView()
                    .padding(14)

                PlaybackControls(event: event)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 10)

                Divider()

                DayTimelineView()
                    .frame(height: 132)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
            }

            if showsInspector {
                Divider()
                EventInspector(event: event, segment: library.selectedSegment)
                    .frame(width: 310)
            }
        }
        .onAppear {
            playback.onSegmentEnded = {
                library.selectNextSegment(scope: playback.advanceScope, wrap: playback.wrapsAtScopeEnd)
            }
            playback.load(segment: library.selectedSegment)
        }
        .onDisappear {
            playback.onSegmentEnded = nil
        }
    }
}

private struct EventHeader: View {
    @EnvironmentObject private var playback: PlaybackCoordinator
    @EnvironmentObject private var bookmarks: BookmarkStore

    let event: ClipEvent

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: event.category.symbolName)
                .font(.title2)
                .foregroundStyle(categoryColor)
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 3) {
                Text(event.title)
                    .font(.title3.weight(.semibold))
                    .lineLimit(1)

                Text("\(event.startDate.formatted(date: .abbreviated, time: .standard)) - \(event.endDate.formatted(date: .omitted, time: .standard))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Picker("Layout", selection: $playback.layoutMode) {
                ForEach(VideoLayoutMode.allCases) { mode in
                    Image(systemName: mode.symbolName)
                        .tag(mode)
                        .help(mode.displayName)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 128)

            StatBadge(value: "\(event.segments.count)", label: "segments", symbol: "film.stack")
            StatBadge(value: "\(event.clipCount)", label: "files", symbol: "video")
            StatBadge(value: "\(bookmarks.count(in: event))", label: "marks", symbol: "star.fill")
            StatBadge(value: ByteCountFormatter.fileSize.string(fromByteCount: event.totalBytes), label: "size", symbol: "externaldrive")
        }
    }

    private var categoryColor: Color {
        switch event.category {
        case .recent: .teal
        case .saved: .orange
        case .sentry: .red
        case .unknown: .secondary
        }
    }
}

private struct EventInsightStrip: View {
    @EnvironmentObject private var bookmarks: BookmarkStore

    let event: ClipEvent

    var body: some View {
        HStack(spacing: 10) {
            InsightCard(
                title: "Coverage",
                value: "\(Int(coverageScore.rounded()))%",
                symbol: "gauge.with.dots.needle.67percent",
                tint: coverageScore > 90 ? .green : coverageScore > 65 ? .orange : .red
            )
            InsightCard(
                title: "Missing Views",
                value: "\(event.missingCameraCount)",
                symbol: "video.badge.exclamationmark",
                tint: event.missingCameraCount == 0 ? .green : .orange
            )
            InsightCard(
                title: "Bookmarks",
                value: "\(bookmarks.count(in: event))",
                symbol: "star.fill",
                tint: .yellow
            )
            TimelineHeatmap(event: event)
        }
    }

    private var coverageScore: Double {
        guard !event.segments.isEmpty else { return 0 }
        let cameras = event.expectedCoverageCameras
        guard !cameras.isEmpty else { return 100 }
        let expected = event.segments.count * cameras.count
        let present = cameras.reduce(0) { $0 + event.cameraCoverage[$1, default: 0] }
        return min(100, (Double(present) / Double(expected)) * 100)
    }
}

private struct InsightCard: View {
    let title: String
    let value: String
    let symbol: String
    let tint: Color

    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: symbol)
                .font(.body.weight(.semibold))
                .foregroundStyle(tint)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.callout.weight(.bold))
                    .monospacedDigit()
                Text(title)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.secondary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
}

private struct TimelineHeatmap: View {
    let event: ClipEvent

    var body: some View {
        HStack(spacing: 3) {
            ForEach(event.segments.prefix(100)) { segment in
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(color(for: segment))
                    .frame(width: 5)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 38, maxHeight: 38, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.secondary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    }

    private func color(for segment: ClipSegment) -> Color {
        let cameras = event.expectedCoverageCameras
        guard !cameras.isEmpty else { return .secondary.opacity(0.3) }
        let count = cameras.filter { segment.videos[$0] != nil }.count
        let halfThreshold = max(1, cameras.count / 2)
        if count == cameras.count { return .green }
        if count >= halfThreshold { return .orange }
        if count >= 1 { return .red }
        return .secondary.opacity(0.3)
    }
}

private struct StatBadge: View {
    let value: String
    let label: String
    let symbol: String

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: symbol)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.caption.weight(.bold))
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.secondary.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
}
