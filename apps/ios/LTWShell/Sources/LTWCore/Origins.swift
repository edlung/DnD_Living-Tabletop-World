import Foundation

/// The server the app plays on and the links it opens (docs/adr/0070-native-apps.md §1, §4); the
/// cases are `apps/native-shim/cases.json`, read by the Kotlin and web tests too. Debug builds
/// also play on a loopback `http` server, the only one whose cookie the server sets without
/// `Secure`.
public enum Origins {
    /// What a scanned code or an opened link asks for.
    public enum Link: Equatable, Sendable {
        /// A link of the server the app plays on: open it in the game.
        case open(url: String)
        /// A link of another server: ask first, then play there.
        case switchServer(origin: String, url: String)
        /// Not a table's code.
        case reject
    }

    /// Where a navigation of the game's view may go.
    public enum Navigation: Equatable, Sendable {
        case inside, outside, refuse
    }

    private static let loopback: Set<String> = ["localhost", "127.0.0.1"]
    private static let linkPaths: Set<String> = [
        "", "/", "/table", "/table/", "/join", "/join/", "/reset", "/reset/",
    ]

    /// A typed server as its origin, `https://host[:port]`, or nil.
    public static func normalize(_ input: String, debug: Bool) -> String? {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let parts = split(text.contains("://") ? text : "https://" + text)
        else { return nil }
        return origin(of: parts, debug: debug)
    }

    /// A scanned code or an opened link, against the server the app plays on.
    public static func classify(_ text: String, current: String, debug: Bool) -> Link {
        guard let parts = split(text.trimmingCharacters(in: .whitespacesAndNewlines)),
            parts.query == nil,
            linkPaths.contains(parts.path),
            let origin = origin(of: parts, debug: debug)
        else { return .reject }
        let fragment = parts.fragment
        let wellFormed: Bool
        switch parts.path.hasSuffix("/") ? String(parts.path.dropLast()) : parts.path {
        case "": wellFormed = fragment == nil
        case "/table": wellFormed = fragment.map(isToken) ?? true
        default: wellFormed = fragment.map(isToken) ?? false
        }
        guard wellFormed else { return .reject }
        let url = origin + (parts.path.isEmpty ? "/" : parts.path) + (fragment.map { "#" + $0 } ?? "")
        return origin == current ? .open(url: url) : .switchServer(origin: origin, url: url)
    }

    /// The game's view stays on its server; other web addresses open outside; nothing else.
    public static func navigation(_ url: String, current: String, debug: Bool) -> Navigation {
        guard let parts = split(url) else { return .refuse }
        switch parts.scheme {
        case "http", "https": return origin(of: parts, debug: debug) == current ? .inside : .outside
        default: return .refuse
        }
    }

    // MARK: - Parsing

    struct Parts {
        let scheme: String
        let hasUserInfo: Bool
        let host: String
        let port: Int?
        let path: String
        let query: String?
        let fragment: String?
    }

    /// A small, strict reading of `scheme://authority/path?query#fragment` — the same on every iOS,
    /// so the shared cases decide it, not Foundation's version of URL parsing.
    static func split(_ text: String) -> Parts? {
        guard !text.unicodeScalars.contains(where: isForbidden),
            let marker = text.range(of: "://")
        else { return nil }
        let scheme = text[..<marker.lowerBound].lowercased()
        guard scheme.range(of: "^[a-z][a-z0-9+.-]*$", options: .regularExpression) != nil
        else { return nil }
        var rest = text[marker.upperBound...]
        var fragment: String?
        if let hash = rest.firstIndex(of: "#") {
            fragment = String(rest[rest.index(after: hash)...])
            rest = rest[..<hash]
        }
        var query: String?
        if let mark = rest.firstIndex(of: "?") {
            query = String(rest[rest.index(after: mark)...])
            rest = rest[..<mark]
        }
        let slash = rest.firstIndex(of: "/") ?? rest.endIndex
        var authority = rest[..<slash]
        let path = String(rest[slash...])
        let hasUserInfo = authority.contains("@")
        if let at = authority.lastIndex(of: "@") {
            authority = authority[authority.index(after: at)...]
        }
        var host = authority
        var port: Int?
        if let colon = authority.lastIndex(of: ":") {
            host = authority[..<colon]
            let digits = authority[authority.index(after: colon)...]
            guard !digits.isEmpty, digits.allSatisfy({ $0.isASCII && $0.isNumber }),
                let value = Int(digits), (1...65535).contains(value)
            else { return nil }
            port = value
        }
        let name = host.lowercased()
        guard isHost(name) else { return nil }
        return Parts(
            scheme: scheme, hasUserInfo: hasUserInfo, host: name, port: port, path: path,
            query: query, fragment: fragment)
    }

    private static func origin(of parts: Parts, debug: Bool) -> String? {
        guard !parts.hasUserInfo else { return nil }
        switch parts.scheme {
        case "https":
            return "https://" + parts.host + (parts.port.map { $0 == 443 ? "" : ":\($0)" } ?? "")
        case "http" where debug && loopback.contains(parts.host):
            return "http://" + parts.host + (parts.port.map { $0 == 80 ? "" : ":\($0)" } ?? "")
        default:
            return nil
        }
    }

    private static func isHost(_ name: String) -> Bool {
        name.range(
            of: "^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$",
            options: .regularExpression) != nil
    }

    private static func isToken(_ text: String) -> Bool {
        text.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil
    }

    /// Characters no URL of the product carries: blanks, controls and the ones RFC 3986 excludes.
    private static func isForbidden(_ scalar: Unicode.Scalar) -> Bool {
        scalar.value < 0x21 || scalar.value == 0x7F || "<>\"{}|\\^`".unicodeScalars.contains(scalar)
    }
}
