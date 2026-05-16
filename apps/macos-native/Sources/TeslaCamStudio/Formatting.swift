import Foundation

enum DateFormatterCache {
    static let exportStamp: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        return formatter
    }()

    static let timeOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.timeStyle = .medium
        formatter.dateStyle = .none
        return formatter
    }()
}

extension ByteCountFormatter {
    nonisolated(unsafe) static let fileSize: ByteCountFormatter = {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        formatter.includesUnit = true
        formatter.includesCount = true
        return formatter
    }()
}

func formatTime(_ seconds: Double) -> String {
    let value = max(0, Int(seconds.rounded()))
    return String(format: "%02d:%02d", value / 60, value % 60)
}

extension Calendar {
    static let app = Calendar.current
}
