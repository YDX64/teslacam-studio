import SwiftUI
import TeslaCamCore

struct SidebarView: View {
    @EnvironmentObject private var library: LibraryViewModel

    var body: some View {
        VStack(spacing: 0) {
            header

            TextField("Search", text: $library.searchText)
                .textFieldStyle(.roundedBorder)
                .padding(.horizontal, 14)
                .padding(.bottom, 10)

            categoryFilters
                .padding(.horizontal, 14)
                .padding(.bottom, 10)

            dayPicker
                .padding(.horizontal, 14)
                .padding(.bottom, 10)

            if library.isScanning {
                ProgressView()
                    .controlSize(.small)
                    .padding(.vertical, 8)
            }

            List(selection: $library.selectedEventID) {
                ForEach(library.filteredEvents) { event in
                    EventRow(event: event)
                        .tag(event.id)
                        .onTapGesture {
                            library.select(event: event)
                        }
                }
            }
            .listStyle(.sidebar)

            footer
        }
        .background(.thinMaterial)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "car.side")
                    .font(.title3)
                Text("TeslaCam Studio")
                    .font(.headline)
                Spacer()
            }
            Text(library.rootURL.path)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(14)
    }

    private var categoryFilters: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                filterButton("All", category: nil, symbol: "tray.full")
                ForEach([ClipCategory.recent, .saved, .sentry], id: \.id) { category in
                    filterButton(category.displayName, category: category, symbol: category.symbolName)
                }
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    filterButton("All", category: nil, symbol: "tray.full")
                    ForEach([ClipCategory.recent, .saved, .sentry], id: \.id) { category in
                        filterButton(category.displayName, category: category, symbol: category.symbolName)
                    }
                }
            }
        }
    }

    private func filterButton(_ title: String, category: ClipCategory?, symbol: String) -> some View {
        Button {
            library.selectedCategory = category
        } label: {
            Label(title, systemImage: symbol)
                .labelStyle(.titleAndIcon)
        }
        .buttonStyle(.borderedProminent)
        .tint(library.selectedCategory == category ? .accentColor : .secondary.opacity(0.2))
    }

    private var dayPicker: some View {
        HStack {
            Text("Date")
            Spacer()
            Picker("Date", selection: Binding(
                get: { library.selectedDay ?? library.availableDays.first ?? Date() },
                set: { library.selectedDay = $0 }
            )) {
                ForEach(library.availableDays, id: \.self) { day in
                    Text(day.formatted(date: .abbreviated, time: .omitted))
                        .tag(day)
                }
            }
            .frame(maxWidth: 190)
        }
    }

    private var footer: some View {
        HStack {
            Text("\(library.filteredEvents.count) events")
            Spacer()
            Text("\(library.snapshot?.clipCount ?? 0) videos")
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .padding(14)
    }
}

private struct EventRow: View {
    let event: ClipEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: event.category.symbolName)
                    .foregroundStyle(categoryColor)
                Text(event.title)
                    .font(.headline)
                    .lineLimit(2)
            }

            Text(event.startDate.formatted(date: .abbreviated, time: .shortened))
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                Label("\(event.segments.count)", systemImage: "film.stack")
                Label("\(event.clipCount)", systemImage: "video")
                Text(ByteCountFormatter.fileSize.string(fromByteCount: event.totalBytes))
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 7)
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
