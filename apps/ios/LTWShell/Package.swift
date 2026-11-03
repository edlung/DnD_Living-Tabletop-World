// swift-tools-version: 6.0
// The shell shared by LTW Player and LTW DM (docs/adr/0070-native-apps.md §8): LTWCore holds the
// rules the bridge's cases test (`apps/native-shim/cases.json`), Foundation only, so its tests run
// on a Mac with `swift test`; LTWShell holds the iOS shell itself.
import PackageDescription

let package = Package(
    name: "LTWShell",
    defaultLocalization: "en",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "LTWCore", targets: ["LTWCore"]),
        .library(name: "LTWShell", targets: ["LTWShell"]),
    ],
    targets: [
        .target(name: "LTWCore"),
        .target(
            name: "LTWShell",
            dependencies: ["LTWCore"],
            resources: [.process("Resources")]
        ),
        .testTarget(name: "LTWCoreTests", dependencies: ["LTWCore"]),
    ],
    swiftLanguageModes: [.v5]
)
