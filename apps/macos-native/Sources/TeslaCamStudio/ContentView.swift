import SwiftUI
import TeslaCamCore

struct ContentView: View {
    @EnvironmentObject private var library: LibraryViewModel
    @EnvironmentObject private var playback: PlaybackCoordinator
    @State private var showsInspector = true

    var body: some View {
        NavigationSplitView {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 280, ideal: 330, max: 430)
        } detail: {
            Group {
                if let event = library.selectedEvent {
                    EventWorkspaceView(event: event, showsInspector: $showsInspector)
                } else {
                    EmptyLibraryView()
                }
            }
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button {
                        library.reload()
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .help("Reload")

                    Button {
                        library.presentFolderPicker()
                    } label: {
                        Image(systemName: "folder")
                    }
                    .help("Open folder")

                    Button {
                        showsInspector.toggle()
                    } label: {
                        Image(systemName: "sidebar.right")
                    }
                    .help("Toggle details")
                }
            }
        }
        .task {
            if library.snapshot == nil {
                await library.scan()
            }
        }
        .onChange(of: library.selectedSegmentID) {
            playback.load(segment: library.selectedSegment)
        }
        .onChange(of: library.selectedEventID) {
            playback.load(segment: library.selectedSegment)
        }
    }
}

private struct EmptyLibraryView: View {
    @EnvironmentObject private var library: LibraryViewModel

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "video.slash")
                .font(.system(size: 54, weight: .light))
                .foregroundStyle(.secondary)
            Text(library.scanError ?? "No TeslaCam clips found")
                .font(.title3.weight(.semibold))
            Button {
                library.presentFolderPicker()
            } label: {
                Label("Open Folder", systemImage: "folder")
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
