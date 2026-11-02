#if os(iOS)
import Foundation
import LTWCore

/// The one thing the shell stores (docs/adr/0070-native-apps.md §3): the server the app plays on and
/// the last few chosen, as origins — never a token, a URL with a fragment or world data.
@MainActor
final class ServerStore {
    private let defaults = UserDefaults.standard
    private let currentKey = "ltw.server"
    private let recentKey = "ltw.recent"
    private let maxRecent = 5

    /// The chosen server, else the owner's deployment.
    var current: String {
        defaults.string(forKey: currentKey).flatMap { Origins.normalize($0, debug: Shell.debug) }
            ?? Shell.defaultServer
    }

    /// The servers chosen before, latest first.
    var recent: [String] {
        var seen = Set<String>()
        return (defaults.stringArray(forKey: recentKey) ?? [])
            .compactMap { Origins.normalize($0, debug: Shell.debug) }
            .filter { seen.insert($0).inserted }
    }

    func choose(_ origin: String) {
        var seen = Set<String>()
        let list = ([origin] + recent).filter { seen.insert($0).inserted }.prefix(maxRecent)
        defaults.set(origin, forKey: currentKey)
        defaults.set(Array(list), forKey: recentKey)
    }
}
#endif
