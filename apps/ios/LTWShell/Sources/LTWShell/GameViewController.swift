#if os(iOS)
import LTWCore
import SafariServices
import SwiftUI
import WebKit

/// The game window of LTW Player and LTW DM (docs/adr/0070-native-apps.md §1, §2, §7): one web view
/// that opens the chosen server's client inside the safe area over the client's ink, keeps every
/// navigation on that origin (other web addresses open in Safari's view, anything else is refused),
/// answers the page's messages, and opens scanned codes and links. Over it, until the client has
/// loaded or when it cannot, the shell's start screen.
@MainActor
public final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let store = ServerStore()
    private let start = StartModel()
    private var webView: WKWebView!
    private var startView: UIViewController!
    private(set) var origin = ""
    private var failed = false
    /// This window's own reason to keep the screen on, apart from any other window's.
    private lazy var awakeReason = "page-\(ObjectIdentifier(self).hashValue)"

    public override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    public override func viewDidLoad() {
        super.viewDidLoad()
        shellLog.info("game window loading")
        view.backgroundColor = Theme.inkUI
        makeWebView()
        makeStartView()
        if let server = Shell.launchArgument("ltwServer").flatMap({ Origins.normalize($0, debug: true) }) {
            store.choose(server)
        }
        startGame()
        if let link = Shell.launchArgument("ltwLink") { open(link: link) }
        if Shell.kind == .dm { TVHub.shared.observe(self) }
    }

    // MARK: - The game

    /// Plays on the chosen server from its start page.
    func startGame() {
        play(origin: store.current, url: store.current + "/")
    }

    private func play(origin: String, url: String) {
        guard let address = URL(string: url) else { return }
        self.origin = origin
        if Shell.kind == .dm { TVHub.shared.origin = origin }
        failed = false
        showStart(.connecting(host: Shell.host(of: origin)))
        webView.load(URLRequest(url: address))
    }

    /// A scanned code or an opened link (ADR 0070 §4): in the game, on another server, or neither.
    func open(link text: String) {
        switch Origins.classify(text, current: origin, debug: Shell.debug) {
        case .open(let url):
            play(origin: origin, url: url)
        case .switchServer(let other, let url):
            let question = UIAlertController(
                title: L("switch.title", Shell.host(of: other)), message: L("switch.text"),
                preferredStyle: .alert)
            question.addAction(UIAlertAction(title: L("cancel"), style: .cancel))
            question.addAction(
                UIAlertAction(title: L("server.connect"), style: .default) { [weak self] _ in
                    self?.store.choose(other)
                    self?.play(origin: other, url: url)
                })
            present(question, animated: true)
        case .reject:
            let notice = UIAlertController(title: L("scan.notACode"), message: nil, preferredStyle: .alert)
            notice.addAction(UIAlertAction(title: L("close"), style: .default))
            present(notice, animated: true)
        }
    }

    private func onPage(_ message: PageMessage) {
        switch message {
        case .ready:
            if Shell.kind == .dm { send(.tv(TVHub.shared.state)) }
        case .haptic(let kind): Alerts.shared.haptic(kind)
        case .awake(let on): Alerts.shared.keepAwake(on, reason: awakeReason, asks: true)
        case .waiting(let count): Alerts.shared.onWaiting(count)
        case .scan: scan()
        case .server: chooseServer()
        case .tvForget: if Shell.kind == .dm { TVHub.shared.forget() }
        // Back is Android's; the TV window speaks for itself (TVController).
        case .backResult, .tvCode, .tvPaired, .tvUnpaired: break
        }
    }

    private func send(_ message: ShellMessage) {
        Bridge.send(message, to: webView)
    }

    /// LTW DM: the TV's state reaches the page as it changes (§6).
    func tvChanged(_ state: ShellMessage.TvState) {
        send(.tv(state))
    }

    private func scan() {
        let scanner = ScannerViewController()
        scanner.modalPresentationStyle = .fullScreen
        scanner.onResult = { [weak self] text in
            if let text { self?.open(link: text) }
        }
        topmost.present(scanner, animated: true)
    }

    private func chooseServer() {
        var sheet: UIViewController?
        let view = ServerSheet(
            current: store.current, recent: store.recent,
            choose: { [weak self] origin in
                sheet?.dismiss(animated: true)
                self?.store.choose(origin)
                self?.startGame()
            },
            cancel: { sheet?.dismiss(animated: true) })
        sheet = UIHostingController(rootView: view)
        if let sheet { topmost.present(sheet, animated: true) }
    }

    private var topmost: UIViewController {
        var controller: UIViewController = self
        while let next = controller.presentedViewController { controller = next }
        return controller
    }

    // MARK: - Views

    private func makeWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.applicationNameForUserAgent =
            (Shell.kind == .dm ? "LTWDM/" : "LTWPlayer/") + Shell.version
        let bridge = Bridge(
            origin: { [weak self] in self?.origin ?? "" },
            onMessage: { [weak self] message in self?.onPage(message) })
        bridge.install(into: configuration, app: Shell.kind.rawValue, features: Shell.features)
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.isInspectable = Shell.debug
        webView.isOpaque = false
        webView.backgroundColor = Theme.inkUI
        webView.scrollView.backgroundColor = Theme.inkUI
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isHidden = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: guide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: guide.trailingAnchor),
        ])
    }

    private func makeStartView() {
        start.retry = { [weak self] in
            guard let self else { return }
            self.play(origin: self.origin, url: self.webView.url?.absoluteString ?? self.origin + "/")
        }
        start.scan = { [weak self] in self?.scan() }
        start.server = { [weak self] in self?.chooseServer() }
        let host = UIHostingController(rootView: StartView(model: start))
        host.view.backgroundColor = Theme.inkUI
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        host.didMove(toParent: self)
        startView = host
    }

    private func showStart(_ state: StartModel.State) {
        start.state = state
        startView.view.isHidden = false
    }

    private func showGame() {
        shellLog.info("game shown on \(Shell.host(of: self.origin), privacy: .public)")
        webView.isHidden = false
        startView.view.isHidden = true
    }

    private func showFailed() {
        shellLog.info("game failed to load from \(Shell.host(of: self.origin), privacy: .public)")
        failed = true
        showStart(.failed(host: Shell.host(of: origin)))
    }

    // MARK: - Navigation (§1)

    public func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async
        -> WKNavigationActionPolicy
    {
        guard let url = navigationAction.request.url else { return .cancel }
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        switch Origins.navigation(url.absoluteString, current: origin, debug: Shell.debug) {
        case .inside:
            return .allow
        case .outside:
            if mainFrame { openOutside(url) }
            return .cancel
        case .refuse:
            return !mainFrame && url.scheme == "about" ? .allow : .cancel
        }
    }

    public func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse) async
        -> WKNavigationResponsePolicy
    {
        if navigationResponse.isForMainFrame, let response = navigationResponse.response as? HTTPURLResponse,
            response.statusCode >= 500
        {
            showFailed()
            return .cancel
        }
        return .allow
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !failed, let url = webView.url,
            Origins.navigation(url.absoluteString, current: origin, debug: Shell.debug) == .inside
        else { return }
        showGame()
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        if !Self.isInterruption(error) { showFailed() }
    }

    public func webView(
        _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error
    ) {
        if !Self.isInterruption(error) { showFailed() }
    }

    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    /// A new page of the server: the last one's screen-on and count go with it (ADR 0070 §5).
    public func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        Alerts.shared.keepAwake(false, reason: awakeReason)
        Alerts.shared.forgetCount()
    }

    /// A load replaced by another, or cancelled by the navigation rules: not a failure.
    private static func isInterruption(_ error: any Error) -> Bool {
        let error = error as NSError
        return (error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled)
            || (error.domain == "WebKitErrorDomain" && error.code == 102)
    }

    private func openOutside(_ url: URL) {
        guard url.scheme == "https" || url.scheme == "http" else { return }
        let safari = SFSafariViewController(url: url)
        safari.preferredControlTintColor = UIColor(Theme.teal)
        topmost.present(safari, animated: true)
    }

    // MARK: - The page's windows and dialogs (§7)

    public func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            switch Origins.navigation(url.absoluteString, current: origin, debug: Shell.debug) {
            case .inside: webView.load(URLRequest(url: url))
            case .outside: openOutside(url)
            case .refuse: break
            }
        }
        return nil
    }

    public func webView(
        _ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo
    ) async {
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in done.resume() })
            topmost.present(alert, animated: true)
        }
    }

    public func webView(
        _ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo
    ) async -> Bool {
        await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: L("cancel"), style: .cancel) { _ in done.resume(returning: false) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in done.resume(returning: true) })
            topmost.present(alert, animated: true)
        }
    }

    public func webView(
        _ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
        initiatedByFrame frame: WKFrameInfo
    ) async -> String? {
        await withCheckedContinuation { (done: CheckedContinuation<String?, Never>) in
            let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: L("cancel"), style: .cancel) { _ in done.resume(returning: nil) })
            alert.addAction(
                UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
                    done.resume(returning: alert?.textFields?.first?.text)
                })
            topmost.present(alert, animated: true)
        }
    }

    /// The page's policy asks for no camera or microphone; nothing is granted.
    public func webView(
        _ webView: WKWebView, decideMediaCapturePermissionsFor origin: WKSecurityOrigin,
        initiatedBy frame: WKFrameInfo, type: WKMediaCaptureType
    ) async -> WKPermissionDecision {
        .deny
    }
}
#endif
