import SwiftUI
import TeslaCamCore

struct VideoGridView: View {
    @EnvironmentObject private var playback: PlaybackCoordinator

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let height = proxy.size.height

            Group {
                if let focused = playback.focusedCamera {
                    VideoTile(camera: focused, isFocused: true)
                        .frame(width: width, height: height)
                } else {
                    layout(width: width, height: height)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    @ViewBuilder
    private func layout(width: Double, height: Double) -> some View {
        let cameras = orderedCameras
        let primary = primaryCamera(in: cameras)
        let secondary = cameras.filter { $0 != primary }

        switch playback.layoutMode {
        case .studio:
            VStack(spacing: 10) {
                VideoTile(camera: primary, isFocused: false)
                    .frame(height: max(260, height * 0.56))

                CameraStrip(cameras: secondary)
            }
            .frame(width: width, height: height)
        case .triptych:
            CameraGrid(cameras: cameras, columns: min(max(cameras.count, 1), 3))
                .frame(width: width, height: height)
        case .theater:
            HStack(spacing: 10) {
                VideoTile(camera: primary, isFocused: false)
                    .frame(width: max(360, width * 0.66))
                CameraGrid(cameras: secondary, columns: 1)
            }
            .frame(width: width, height: height)
        }
    }

    private var orderedCameras: [CameraKind] {
        let cameras = playback.currentSegment?.availableCameras ?? playback.players.keys.sorted()
        return cameras.isEmpty ? [.main] : cameras
    }

    private func primaryCamera(in cameras: [CameraKind]) -> CameraKind {
        cameras.first(where: { $0 == .front })
            ?? cameras.first(where: { $0 == .main })
            ?? cameras.first
            ?? .main
    }
}

private struct CameraStrip: View {
    let cameras: [CameraKind]

    var body: some View {
        if cameras.isEmpty {
            VideoTile(camera: .main, isFocused: false)
        } else {
            CameraGrid(cameras: cameras, columns: min(max(cameras.count, 1), 4))
        }
    }
}

private struct CameraGrid: View {
    let cameras: [CameraKind]
    let columns: Int

    var body: some View {
        let gridColumns = Array(repeating: GridItem(.flexible(), spacing: 10), count: max(columns, 1))
        LazyVGrid(columns: gridColumns, spacing: 10) {
            ForEach(cameras, id: \.id) { camera in
                VideoTile(camera: camera, isFocused: false)
                    .aspectRatio(16 / 9, contentMode: .fit)
            }
        }
    }
}

private struct VideoTile: View {
    @EnvironmentObject private var playback: PlaybackCoordinator

    let camera: CameraKind
    let isFocused: Bool

    var body: some View {
        let player = playback.renderedPlayer(for: camera)
        let isStandby = playback.hasVideo(for: camera) && player == nil

        ZStack {
            Color.black

            if let player {
                PlayerSurfaceView(player: player)
                    .background(Color.black)
            } else if isStandby {
                placeholder("Standby")
            } else {
                placeholder("\(camera.displayName) missing")
            }
        }
        .overlay(alignment: .topLeading) {
            HStack(spacing: 7) {
                Image(systemName: camera.symbolName)
                Text(camera.displayName)
                    .fontWeight(.semibold)
            }
            .font(.caption)
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(.black.opacity(0.55))
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .padding(9)
        }
        .overlay(alignment: .topTrailing) {
            Button {
                playback.toggleFocus(camera)
            } label: {
                Image(systemName: isFocused ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.white)
            .background(.black.opacity(0.55))
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .padding(9)
            .help(isFocused ? "Exit focus" : "Focus camera")
        }
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    }

    private func placeholder(_ text: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: camera.symbolName)
                .font(.title)
            Text(text)
                .font(.callout.weight(.medium))
        }
        .foregroundStyle(.secondary)
    }
}
