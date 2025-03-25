// swift-tools-version: 6.0
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "EmbeddedElementCall",
    platforms: [.iOS(.v17)],
    products: [
        .library(
            name: "EmbeddedElementCall",
            targets: ["EmbeddedElementCall"]),
    ],
    targets: [
        .target(
            name: "EmbeddedElementCall",
            resources: [.copy("../dist")]),
    ]
)
