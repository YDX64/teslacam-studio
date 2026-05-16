import AppKit
import SwiftUI

@main
struct TeslaCamStudioApp: App {
    @StateObject private var library: LibraryViewModel
    @StateObject private var playback = PlaybackCoordinator()
    @StateObject private var bookmarks = BookmarkStore()
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    init() {
        _library = StateObject(wrappedValue: LibraryViewModel(rootURL: StartupRootResolver.resolve()))
    }

    var body: some Scene {
        Window("TeslaCam Studio", id: "main") {
            ContentView()
                .environmentObject(library)
                .environmentObject(playback)
                .environmentObject(bookmarks)
                .frame(minWidth: 1120, minHeight: 740)
                .onAppear {
                    NSApp.setActivationPolicy(.regular)
                    NSApp.activate(ignoringOtherApps: true)
                }
        }
        .defaultSize(width: 1440, height: 960)
        .commands {
            CommandMenu("Playback") {
                Button(playback.isPlaying ? "Pause" : "Play") {
                    playback.togglePlayPause()
                }
                .keyboardShortcut(.space, modifiers: [])

                Button("Previous Clip") {
                    library.selectPreviousSegment(scope: playback.advanceScope, wrap: playback.wrapsAtScopeEnd)
                }
                .keyboardShortcut(.leftArrow, modifiers: [.command])

                Button("Next Clip") {
                    library.selectNextSegment(scope: playback.advanceScope, wrap: playback.wrapsAtScopeEnd)
                }
                .keyboardShortcut(.rightArrow, modifiers: [.command])
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
