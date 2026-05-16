// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "TeslaCamStudio",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "TeslaCamStudio", targets: ["TeslaCamStudio"])
    ],
    targets: [
        .target(name: "TeslaCamCore"),
        .executableTarget(
            name: "TeslaCamStudio",
            dependencies: ["TeslaCamCore"],
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("CoreMedia")
            ]
        )
    ]
)
