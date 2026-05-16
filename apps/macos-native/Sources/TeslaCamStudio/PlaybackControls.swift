import AppKit
import SwiftUI
import TeslaCamCore

struct PlaybackControls: View {
    @EnvironmentObject private var library: LibraryViewModel
    @EnvironmentObject private var playback: PlaybackCoordinator
    @EnvironmentObject private var bookmarks: BookmarkStore

    let event: ClipEvent

    var body: some View {
        VStack(spacing: 8) {
            PlaybackScrubber()

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    transportControls
                    Divider().frame(height: 30)
                    advanceControls
                    Spacer(minLength: 8)
                    statusView
                }

                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        transportControls
                        Spacer(minLength: 8)
                        statusView
                    }
                    HStack {
                        advanceControls
                        Spacer(minLength: 0)
                    }
                }
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    rangeStatus
                    Spacer(minLength: 8)
                    actionControls
                }

                VStack(alignment: .leading, spacing: 7) {
                    rangeStatus
                    ScrollView(.horizontal, showsIndicators: false) {
                        actionControls
                    }
                }
            }
        }
    }

    private var transportControls: some View {
        HStack(spacing: 6) {
            Button {
                library.selectPreviousSegment(scope: playback.advanceScope, wrap: playback.wrapsAtScopeEnd)
            } label: {
                Image(systemName: "backward.end.fill").frame(width: 28, height: 28)
            }
            .help("Previous clip in selected scope")

            Button {
                playback.nudge(seconds: -5)
            } label: {
                Image(systemName: "gobackward.5").frame(width: 28, height: 28)
            }
            .help("Back 5 seconds")

            Button {
                playback.stepFrame(direction: -1)
            } label: {
                Image(systemName: "chevron.left.2").frame(width: 28, height: 28)
            }
            .help("Previous frame")

            Button {
                playback.togglePlayPause()
            } label: {
                Image(systemName: playback.isPlaying ? "pause.fill" : "play.fill")
                    .font(.title3.weight(.semibold))
                    .frame(width: 40, height: 32)
            }
            .buttonStyle(.borderedProminent)
            .help(playback.isPlaying ? "Pause" : "Play")

            Button {
                playback.stepFrame(direction: 1)
            } label: {
                Image(systemName: "chevron.right.2").frame(width: 28, height: 28)
            }
            .help("Next frame")

            Button {
                playback.nudge(seconds: 5)
            } label: {
                Image(systemName: "goforward.5").frame(width: 28, height: 28)
            }
            .help("Forward 5 seconds")

            Button {
                library.selectNextSegment(scope: playback.advanceScope, wrap: playback.wrapsAtScopeEnd)
            } label: {
                Image(systemName: "forward.end.fill").frame(width: 28, height: 28)
            }
            .help("Next clip in selected scope")
        }
        .buttonStyle(.bordered)
    }

    private var advanceControls: some View {
        HStack(spacing: 8) {
            Button {
                Task { @MainActor in
                    let changed = library.selectFirstSegment(scope: playback.advanceScope)
                    if changed { await Task.yield() }
                    playback.play()
                }
            } label: {
                Image(systemName: "play.rectangle.on.rectangle").frame(width: 28, height: 28)
            }
            .buttonStyle(.bordered)
            .help("Start selected scope from the beginning")

            Menu {
                ForEach(PlaybackAdvanceScope.allCases) { scope in
                    Button {
                        playback.advanceScope = scope
                    } label: {
                        Label(scope.displayName, systemImage: scope.symbolName)
                    }
                }
            } label: {
                Label(playback.advanceScope.displayName, systemImage: playback.advanceScope.symbolName)
            }
            .frame(width: 92)
            .help("Automatic playback scope")

            Toggle(isOn: $playback.wrapsAtScopeEnd) {
                Image(systemName: "repeat")
            }
            .toggleStyle(.button)
            .help("Loop selected scope when it ends")

            Menu {
                ForEach(VideoRenderMode.allCases) { mode in
                    Button {
                        playback.renderMode = mode
                    } label: {
                        Label(mode.displayName, systemImage: mode.symbolName)
                    }
                }
            } label: {
                Label(playback.renderMode.displayName, systemImage: playback.renderMode.symbolName)
            }
            .frame(width: 116)
            .help("Video rendering mode")

            Menu {
                ForEach([Float(0.5), Float(1), Float(1.5), Float(2), Float(4)], id: \.self) { value in
                    Button(speedTitle(value)) {
                        playback.setPlaybackRate(value)
                    }
                }
            } label: {
                Label(speedTitle(playback.playbackRate), systemImage: "speedometer")
            }
            .frame(width: 86)
            .help("Playback speed")
        }
    }

    private var statusView: some View {
        Text(playback.statusMessage ?? currentScopeText)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .truncationMode(.middle)
            .frame(maxWidth: 240, alignment: .trailing)
    }

    private var rangeStatus: some View {
        HStack(spacing: 6) {
            Label("Range", systemImage: "selection.pin.in.out")
                .foregroundStyle(.secondary)
            Text(rangeText)
                .monospacedDigit()
        }
        .font(.caption)
        .lineLimit(1)
        .foregroundStyle(.secondary)
    }

    private var actionControls: some View {
        HStack(spacing: 6) {
            Button {
                playback.markRangeStart()
            } label: {
                Image(systemName: "inset.filled.leadinghalf.rectangle").frame(width: 28, height: 28)
            }
            .help("Set in point")

            Button {
                playback.markRangeEnd()
            } label: {
                Image(systemName: "inset.filled.trailinghalf.rectangle").frame(width: 28, height: 28)
            }
            .help("Set out point")

            Button {
                if let segment = library.selectedSegment {
                    bookmarks.toggle(event: event, segment: segment)
                }
            } label: {
                Image(systemName: isCurrentSegmentBookmarked ? "star.fill" : "star").frame(width: 28, height: 28)
            }
            .help("Bookmark segment")

            Button {
                playback.revealCurrentSegmentInFinder()
            } label: {
                Image(systemName: "folder").frame(width: 28, height: 28)
            }
            .help("Show selected files")

            Button {
                Task { await playback.exportSnapshots() }
            } label: {
                Image(systemName: "camera.viewfinder").frame(width: 28, height: 28)
            }
            .help("Save frame snapshots")

            Button {
                playback.exportIncidentReport(event: event, segment: library.selectedSegment)
            } label: {
                Image(systemName: "doc.text.magnifyingglass").frame(width: 28, height: 28)
            }
            .help("Export incident report")

            Button {
                playback.exportSelectedSegment()
            } label: {
                Image(systemName: "square.and.arrow.up.on.square").frame(width: 28, height: 28)
            }
            .help("Export selected segment")

            Button {
                playback.exportEvent(event)
            } label: {
                Image(systemName: "square.and.arrow.up").frame(width: 28, height: 28)
            }
            .help("Export event")
        }
        .buttonStyle(.bordered)
    }

    private var isCurrentSegmentBookmarked: Bool {
        guard let segment = library.selectedSegment else { return false }
        return bookmarks.isBookmarked(event: event, segment: segment)
    }

    private var currentScopeText: String {
        let loop = playback.wrapsAtScopeEnd ? ", loop on" : ""
        return "Auto: \(playback.advanceScope.displayName)\(loop)"
    }

    private var rangeText: String {
        let start = playback.rangeStart.map(formatTime) ?? "--:--"
        let end = playback.rangeEnd.map(formatTime) ?? "--:--"
        return "\(start) - \(end)"
    }

    private func speedTitle(_ value: Float) -> String {
        if value.rounded() == value {
            return "\(Int(value))x"
        }
        return String(format: "%.1fx", value)
    }
}

private struct PlaybackScrubber: View {
    @EnvironmentObject private var playback: PlaybackCoordinator

    var body: some View {
        AppKitPlaybackScrubber(playback: playback)
            .frame(height: 22)
    }
}

private struct AppKitPlaybackScrubber: NSViewRepresentable {
    let playback: PlaybackCoordinator

    func makeNSView(context: Context) -> ScrubberHostView {
        ScrubberHostView()
    }

    func updateNSView(_ nsView: ScrubberHostView, context: Context) {
        nsView.currentTimeProvider = { [playback] in playback.currentTime }
        nsView.seekHandler = { [playback] seconds in
            playback.seek(to: seconds, exact: true)
        }
        nsView.configure(
            currentTime: playback.currentTime,
            duration: playback.duration,
            isPlaying: playback.isPlaying
        )
    }
}

private final class ScrubberHostView: NSView {
    var currentTimeProvider: (() -> Double)?
    var seekHandler: ((Double) -> Void)?

    private let currentLabel = NSTextField(labelWithString: "00:00")
    private let durationLabel = NSTextField(labelWithString: "00:00")
    private let slider = NSSlider(value: 0, minValue: 0, maxValue: 1, target: nil, action: nil)
    private var timer: Timer?
    private var duration: Double = 1
    private var isPlaying = false
    private var isScrubbing = false

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setup()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(currentTime: Double, duration: Double, isPlaying: Bool) {
        self.duration = max(duration, 1)
        self.isPlaying = isPlaying
        slider.maxValue = self.duration
        durationLabel.stringValue = formatTime(self.duration)

        if !isScrubbing {
            setDisplayedTime(currentTime)
        }

        if isPlaying {
            startTimer()
        } else {
            stopTimer()
        }
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window == nil {
            stopTimer()
        }
    }

    private func setup() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor

        for label in [currentLabel, durationLabel] {
            label.font = .monospacedDigitSystemFont(ofSize: NSFont.smallSystemFontSize, weight: .regular)
            label.textColor = .secondaryLabelColor
            label.alignment = label == currentLabel ? .right : .left
            label.setContentHuggingPriority(.required, for: .horizontal)
            label.setContentCompressionResistancePriority(.required, for: .horizontal)
            label.widthAnchor.constraint(equalToConstant: 54).isActive = true
        }

        slider.isContinuous = true
        slider.target = self
        slider.action = #selector(sliderChanged(_:))
        slider.setContentHuggingPriority(.defaultLow, for: .horizontal)

        let stack = NSStackView(views: [currentLabel, slider, durationLabel])
        stack.orientation = .horizontal
        stack.spacing = 10
        stack.alignment = .centerY
        stack.distribution = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor)
        ])
    }

    private func startTimer() {
        guard timer == nil else { return }
        let timer = Timer(timeInterval: 0.5, target: self, selector: #selector(timerFired(_:)), userInfo: nil, repeats: true)
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func refreshFromPlayer() {
        guard !isScrubbing, let currentTimeProvider else { return }
        setDisplayedTime(currentTimeProvider())
    }

    @objc private func timerFired(_ timer: Timer) {
        refreshFromPlayer()
    }

    @objc private func sliderChanged(_ sender: NSSlider) {
        let seconds = min(max(sender.doubleValue, 0), duration)
        isScrubbing = NSApp.currentEvent?.type == .leftMouseDragged
        setDisplayedTime(seconds)

        if !isScrubbing {
            seekHandler?(seconds)
        }
    }

    private func setDisplayedTime(_ seconds: Double) {
        let bounded = min(max(seconds, 0), duration)
        if abs(slider.doubleValue - bounded) > 0.05 {
            slider.doubleValue = bounded
        }
        currentLabel.stringValue = formatTime(bounded)
    }
}
