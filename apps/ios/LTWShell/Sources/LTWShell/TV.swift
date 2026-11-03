#if os(iOS)
import LTWCore
import UIKit
import WebKit

/// LTW DM's TV (docs/adr/0070-native-apps.md §6): what the TV window and the DM's game window share —
/// the server the DM plays on, and how the TV stands, which the DM's page hears as `tv` messages.
@MainActor
final class TVHub {
    static let shared = TVHub()

    private(set) var state: ShellMessage.TvState = .absent {
        didSet {
            guard state != oldValue else { return }
            for window in windows.allObjects { window.tvChanged(state) }
        }
    }

    /// The DM's game windows (an iPad may have more than one); each tells its page every change.
    private let windows = NSHashTable<GameViewController>.weakObjects()

    func observe(_ window: GameViewController) {
        windows.add(window)
    }

    /// The server the DM plays on; the TV follows it, and what it said of the old one is void.
    var origin = "" {
        didSet {
            guard origin != oldValue, let tv else { return }
            state = .connected
            tv.open(origin)
        }
    }

    private weak var tv: TVController?

    /// Whether an external screen shows the TV's window now.
    var hasTV: Bool { tv != nil }

    func attach(_ controller: TVController) {
        tv = controller
        state = .connected
        Alerts.shared.keepAwake(true, reason: "tv")
        if !origin.isEmpty { controller.open(origin) }
    }

    func detach() {
        tv = nil
        state = .absent
        Alerts.shared.keepAwake(false, reason: "tv")
    }

    /// What the table display in the TV window reports of itself.
    func report(_ message: PageMessage) {
        switch message {
        case .tvCode(let code): state = .pairing(code: code)
        case .tvPaired(let campaign): state = .paired(campaign: campaign)
        case .tvUnpaired: state = .connected
        default: break
        }
    }

    /// The DM asks the TV to show this campaign: it forgets its pairing and shows a new code.
    func forget() {
        tv?.forget()
    }
}

/// The TV window's view: the table display (`/display`) of the DM's server in a website data store of
/// its own — it holds only the display device's cookie, never the DM's session — read only, in the
/// PARTY perspective like any paired TV (ADR 0042).
final class TVController: UIViewController, WKNavigationDelegate {
    private var webView: WKWebView!
    private var origin = ""

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.inkUI
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: Self.storeIdentifier)
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let bridge = Bridge(
            origin: { [weak self] in self?.origin ?? "" },
            onMessage: { message in TVHub.shared.report(message) })
        bridge.install(into: configuration, app: "tv", features: ["awake"])
        webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = Theme.inkUI
        webView.scrollView.isScrollEnabled = false
        webView.isInspectable = Shell.debug
        view.addSubview(webView)
    }

    func open(_ origin: String) {
        loadViewIfNeeded()
        guard let url = URL(string: origin + "/display") else { return }
        self.origin = origin
        webView.load(URLRequest(url: url))
    }

    /// The TV stays on the DM's server's table display; nothing else loads here.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async
        -> WKNavigationActionPolicy
    {
        guard let url = navigationAction.request.url,
            Origins.navigation(url.absoluteString, current: origin, debug: Shell.debug) == .inside
        else { return .cancel }
        return .allow
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    func forget() {
        guard webView != nil else { return }
        Bridge.send(.forget, to: webView)
    }

    /// One data store per install, kept apart from the DM's, so a TV paired once stays paired.
    private static var storeIdentifier: UUID {
        let key = "ltw.tv-store"
        if let text = UserDefaults.standard.string(forKey: key), let id = UUID(uuidString: text) { return id }
        let id = UUID()
        UserDefaults.standard.set(id.uuidString, forKey: key)
        return id
    }
}

/// The external screen's scene (AirPlay or a cable): a non-interactive window with the TV's view,
/// which the system shows there instead of mirroring the DM's screen.
@objc(LTWTVSceneDelegate)
public final class TVSceneDelegate: UIResponder, UIWindowSceneDelegate {
    public var window: UIWindow?

    public func scene(
        _ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let scene = scene as? UIWindowScene else { return }
        shellLog.info("tv scene connected")
        let window = UIWindow(windowScene: scene)
        let controller = TVController()
        window.rootViewController = controller
        window.isHidden = false
        self.window = window
        TVHub.shared.attach(controller)
    }

    public func sceneDidDisconnect(_ scene: UIScene) {
        shellLog.info("tv scene disconnected")
        TVHub.shared.detach()
        window = nil
    }
}
#endif
