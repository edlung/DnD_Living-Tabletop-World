import Foundation
import Testing

@testable import LTWCore

/// The bridge's contract as the shared case table (`apps/native-shim/cases.json`, ADR 0070 §9): the
/// same cases the web client's and the Android app's tests read.
struct Cases: Decodable {
    struct OriginCase: Decodable {
        let input: String
        let debug: String?
        let release: String?
    }

    struct ScanCase: Decodable {
        let text: String
        let current: String
        let build: String
        let outcome: String
        let origin: String?
        let url: String?
    }

    struct PageCase: Decodable {
        let json: String
        let valid: Bool
    }

    let token: String
    let origins: [OriginCase]
    let scans: [ScanCase]
    let pageMessages: [PageCase]

    static let shared: Cases = {
        let file = URL(filePath: #filePath).deletingLastPathComponent()
            .appending(path: "../../../../native-shim/cases.json").standardized
        // swiftlint:disable:next force_try
        return try! JSONDecoder().decode(Cases.self, from: Data(contentsOf: file))
    }()

    func withToken(_ text: String) -> String { text.replacingOccurrences(of: "TOKEN", with: token) }
}

@Suite("The bridge's shared cases")
struct ContractTests {
    let cases = Cases.shared

    @Test("Typed servers become origins")
    func origins() {
        for entry in cases.origins {
            let input = cases.withToken(entry.input)
            #expect(Origins.normalize(input, debug: true) == entry.debug, "debug: \(input)")
            #expect(Origins.normalize(input, debug: false) == entry.release, "release: \(input)")
        }
    }

    @Test("Scanned codes open, move to another server, or are refused")
    func scans() {
        for entry in cases.scans {
            let text = cases.withToken(entry.text)
            let builds: [Bool] =
                switch entry.build {
                case "debug": [true]
                case "release": [false]
                default: [true, false]
                }
            for debug in builds {
                let want: Origins.Link =
                    switch entry.outcome {
                    case "open": .open(url: cases.withToken(entry.url ?? ""))
                    case "switch":
                        .switchServer(origin: entry.origin ?? "", url: cases.withToken(entry.url ?? ""))
                    default: .reject
                    }
                #expect(
                    Origins.classify(text, current: entry.current, debug: debug) == want,
                    "\(text) (debug: \(debug))")
            }
        }
    }

    @Test("The page's messages are parsed strictly")
    func pageMessages() {
        for entry in cases.pageMessages {
            #expect((PageMessage.parse(entry.json) != nil) == entry.valid, "\(entry.json)")
        }
    }

    @Test("The game's view stays on its server")
    func navigation() {
        let current = "https://ltw.vardahei.tech"
        #expect(Origins.navigation("https://ltw.vardahei.tech/table", current: current, debug: false) == .inside)
        #expect(
            Origins.navigation("https://creativecommons.org/licenses/by/4.0/", current: current, debug: false)
                == .outside)
        #expect(Origins.navigation("http://ltw.vardahei.tech/", current: current, debug: false) == .outside)
        #expect(Origins.navigation("javascript:alert(1)", current: current, debug: false) == .refuse)
        #expect(Origins.navigation("about:blank", current: current, debug: false) == .refuse)
        #expect(Origins.navigation("file:///etc/hosts", current: current, debug: false) == .refuse)
    }

    @Test("The shell's messages are the JSON the page's parser reads")
    func shellMessages() {
        #expect(ShellMessage.back(id: 3).json == #"{"id":3,"type":"back"}"#)
        #expect(ShellMessage.forget.json == #"{"type":"forget"}"#)
        #expect(
            ShellMessage.tv(.paired(campaign: "ravenford-ru-1")).json
                == #"{"campaign":"ravenford-ru-1","state":"paired","type":"tv"}"#)
        #expect(ShellMessage.tv(.absent).json == #"{"state":"absent","type":"tv"}"#)
        #expect(
            ShellMessage.tv(.pairing(code: "AB2CD3EF")).json
                == #"{"code":"AB2CD3EF","state":"pairing","type":"tv"}"#)
    }
}
