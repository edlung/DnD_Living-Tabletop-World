#if os(iOS)
import LTWCore
import OSLog
import UIKit

/// What the shell did, for Console and `log show` — states and hosts only, never a URL with its
/// fragment, a token or anything of the game (docs/adr/0070-native-apps.md §3).
let shellLog = Logger(subsystem: "tech.vardahei.ltw", category: "shell")

/// Which app this is and what its Info.plist says (docs/adr/0070-native-apps.md §1, §7, §8):
/// `LTWAppKind` (player or dm), `LTWDefaultServer`, and `LTWAllowsLoopback` — YES in Debug builds
/// only, which also opens the Web Inspector and the launch arguments the simulator's journeys use.
public enum AppKind: String, Sendable {
    case player, dm
}

@MainActor
enum Shell {
    static var kind: AppKind {
        (Bundle.main.object(forInfoDictionaryKey: "LTWAppKind") as? String).flatMap(AppKind.init) ?? .player
    }

    static var debug: Bool {
        (Bundle.main.object(forInfoDictionaryKey: "LTWAllowsLoopback") as? String) == "YES"
    }

    static var defaultServer: String {
        (Bundle.main.object(forInfoDictionaryKey: "LTWDefaultServer") as? String)
            .flatMap { Origins.normalize($0, debug: false) } ?? "https://ltw.vardahei.tech"
    }

    /// The features the page may use in this app's game window (§2).
    static var features: [String] {
        var list = ["haptics", "awake", "waiting", "scan", "server"]
        if kind == .dm { list.append("tv") }
        return list
    }

    static var version: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0"
    }

    /// A launch argument (`-ltwServer …`, `-ltwLink …`) in debug builds only.
    static func launchArgument(_ name: String) -> String? {
        debug ? UserDefaults.standard.string(forKey: name) : nil
    }

    /// The page's shim with this window's description in place of its placeholder.
    static func shim(app: String, features: [String]) -> String {
        guard let url = Bundle.main.url(forResource: "ltw-native", withExtension: "js"),
            let template = try? String(contentsOf: url, encoding: .utf8)
        else { return "" }
        let config: [String: Any] = ["platform": "ios", "app": app, "features": features]
        let data = (try? JSONSerialization.data(withJSONObject: config, options: [.sortedKeys])) ?? Data()
        return template.replacingOccurrences(
            of: "__LTW_NATIVE_CONFIG__", with: String(decoding: data, as: UTF8.self))
    }

    static func host(of origin: String) -> String {
        guard let url = URL(string: origin), let host = url.host() else { return origin }
        return url.port.map { "\(host):\($0)" } ?? host
    }
}

/// The shell's words, in the device's language (English or Russian).
func L(_ key: String) -> String {
    NSLocalizedString(key, bundle: .module, comment: "")
}

func L(_ key: String, _ argument: String) -> String {
    String(format: L(key), argument)
}
#endif
