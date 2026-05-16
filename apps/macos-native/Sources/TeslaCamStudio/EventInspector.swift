import SwiftUI
import TeslaCamCore

struct EventInspector: View {
    let event: ClipEvent
    let segment: ClipSegment?

    var body: some View {
        List {
            Section("Details") {
                DetailRow("Type", event.category.displayName)
                DetailRow("City", event.metadata?.city ?? "Unknown")
                DetailRow("Reason", event.metadata?.formattedReason ?? "Unknown")
                DetailRow("Event", event.startDate.formatted(date: .abbreviated, time: .standard))
                DetailRow("Range", "\(event.startDate.formatted(date: .omitted, time: .standard)) - \(event.endDate.formatted(date: .omitted, time: .standard))")
                DetailRow("Duration", durationText)
                DetailRow("Segments", "\(event.segments.count)")
                DetailRow("Videos", "\(event.clipCount)")
                DetailRow("Missing", "\(event.missingCameraCount)")
            }

            Section("Coverage") {
                ForEach(event.cameraCoverage.keys.sorted(), id: \.id) { camera in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Label(camera.displayName, systemImage: camera.symbolName)
                            Spacer()
                            Text("\(event.cameraCoverage[camera, default: 0])/\(event.segments.count)")
                                .foregroundStyle(.secondary)
                        }
                        ProgressView(value: Double(event.cameraCoverage[camera, default: 0]), total: Double(max(event.segments.count, 1)))
                    }
                }
            }

            if let segment {
                Section("Selected Segment") {
                    DetailRow("Time", segment.timestamp.formatted(date: .abbreviated, time: .standard))
                    DetailRow("Files", "\(segment.videos.count)")
                    DetailRow("Size", ByteCountFormatter.fileSize.string(fromByteCount: segment.totalBytes))
                    ForEach(segment.availableCameras, id: \.id) { camera in
                        if let video = segment.videos[camera] {
                            VStack(alignment: .leading, spacing: 5) {
                                Label(camera.displayName, systemImage: camera.symbolName)
                                    .font(.headline)
                                Text(video.url.lastPathComponent)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                                Text(ByteCountFormatter.fileSize.string(fromByteCount: video.byteCount))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }

            Section("Source") {
                Text(event.sourceURL.path)
                    .font(.caption)
                    .textSelection(.enabled)
            }

            if let latitude = event.metadata?.estimatedLatitude,
               let longitude = event.metadata?.estimatedLongitude {
                Section("Location") {
                    DetailRow("Latitude", "\(latitude)")
                    DetailRow("Longitude", "\(longitude)")
                    Link("Open in Apple Maps", destination: URL(string: "https://maps.apple.com/?ll=\(latitude),\(longitude)")!)
                }
            }
        }
        .listStyle(.sidebar)
    }

    private var durationText: String {
        let seconds = max(0, event.endDate.timeIntervalSince(event.startDate))
        let minutes = Int(seconds / 60)
        let remainder = Int(seconds) % 60
        return "\(minutes)m \(remainder)s"
    }
}

private struct DetailRow: View {
    let label: String
    let value: String

    init(_ label: String, _ value: String) {
        self.label = label
        self.value = value
    }

    var body: some View {
        HStack(alignment: .top) {
            Text(label)
                .foregroundStyle(.secondary)
                .frame(width: 78, alignment: .leading)
            Text(value)
                .textSelection(.enabled)
        }
        .font(.caption)
    }
}
