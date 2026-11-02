import Foundation

/// What the page asks of the shell, protocol version 1 (docs/adr/0070-native-apps.md §2). A message
/// is parsed strictly: an unknown type or a field of the wrong kind is ignored, and nothing the page
/// wrote reaches anything that acts on it except these values.
public enum PageMessage: Equatable, Sendable {
    public enum HapticKind: String, Sendable {
        case alert, dice
    }

    case ready
    case haptic(HapticKind)
    case awake(Bool)
    case waiting(Int)
    case scan
    case server
    case backResult(handled: Bool, id: Int?)
    case tvCode(String)
    case tvPaired(campaign: String?)
    case tvUnpaired
    case tvForget

    private static let maxLength = 1024

    public static func parse(_ text: String) -> PageMessage? {
        guard !text.isEmpty, text.utf8.count <= maxLength, let data = text.data(using: .utf8),
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        else { return nil }
        switch object["type"] as? String {
        case "ready": return .ready
        case "haptic": return (object["kind"] as? String).flatMap(HapticKind.init).map { .haptic($0) }
        case "awake": return boolean(object["on"]).map { .awake($0) }
        case "waiting": return count(object["count"]).map { .waiting($0) }
        case "scan": return .scan
        case "server": return .server
        case "back-result": return backResult(object)
        case "tv-code": return (object["code"] as? String).flatMap(pairingCode).map { .tvCode($0) }
        case "tv-paired":
            guard let campaign = object["campaign"] else { return .tvPaired(campaign: nil) }
            return (campaign as? String).flatMap(campaignID).map { .tvPaired(campaign: $0) }
        case "tv-unpaired": return .tvUnpaired
        case "tv-forget": return .tvForget
        default: return nil
        }
    }

    private static func backResult(_ object: [String: Any]) -> PageMessage? {
        guard let handled = boolean(object["handled"]) else { return nil }
        guard let id = object["id"] else { return .backResult(handled: handled, id: nil) }
        return sequence(id).map { .backResult(handled: handled, id: $0) }
    }

    /// A whole number of 0 or more, as the shell numbers its Back presses.
    static func sequence(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
            !["d", "f"].contains(String(cString: number.objCType)), number.intValue >= 0
        else { return nil }
        return number.intValue
    }

    /// A campaign's ID as the bridge carries it: opaque, short, no markup.
    static func campaignID(_ text: String) -> String? {
        text.range(of: "^[A-Za-z0-9._:-]{1,128}$", options: .regularExpression) != nil ? text : nil
    }

    /// A JSON `true` or `false`, never a number that Foundation would also read as one.
    private static func boolean(_ value: Any?) -> Bool? {
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else {
            return nil
        }
        return number.boolValue
    }

    /// A whole number of 0–99 written as one, never `2.5`, `"3"` or `true`.
    private static func count(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
            !["d", "f"].contains(String(cString: number.objCType))
        else { return nil }
        let count = number.intValue
        return (0...99).contains(count) ? count : nil
    }

    /// A TV's pairing code as the server makes it: eight of `A-HJKMNP-Z2-9`.
    private static func pairingCode(_ text: String) -> String? {
        text.range(of: "^[A-HJKMNP-Z2-9]{8}$", options: .regularExpression) != nil ? text : nil
    }
}

/// What the shell tells the page (§2): Android's Back, in LTW DM how its TV stands (a paired TV
/// names the campaign it shows), and to the TV's own page, to forget its pairing.
public enum ShellMessage: Equatable, Sendable {
    public enum TvState: Equatable, Sendable {
        case absent, connected
        case pairing(code: String)
        case paired(campaign: String?)
    }

    case back(id: Int)
    case tv(TvState)
    case forget

    /// The JSON text the page's shim parses.
    public var json: String {
        let object: [String: Any]
        switch self {
        case .back(let id): object = ["type": "back", "id": id]
        case .tv(.absent): object = ["type": "tv", "state": "absent"]
        case .tv(.connected): object = ["type": "tv", "state": "connected"]
        case .tv(.paired(nil)): object = ["type": "tv", "state": "paired"]
        case .tv(.paired(let campaign?)): object = ["type": "tv", "state": "paired", "campaign": campaign]
        case .tv(.pairing(let code)): object = ["type": "tv", "state": "pairing", "code": code]
        case .forget: object = ["type": "forget"]
        }
        let data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])) ?? Data()
        return String(decoding: data, as: UTF8.self)
    }
}
