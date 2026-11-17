#if os(iOS)
import LTWCore
import WebKit

/// The bridge's native side in one web view (docs/adr/0070-native-apps.md §2): the shim installed at
/// document start in the main frame, and the `ltw` message handler that hears only the main frame of
/// the chosen origin and hands on what parses.
@MainActor
final class Bridge: NSObject, WKScriptMessageHandler {
    private let onMessage: (PageMessage) -> Void
    private let origin: () -> String

    init(origin: @escaping () -> String, onMessage: @escaping (PageMessage) -> Void) {
        self.origin = origin
        self.onMessage = onMessage
    }

    /// Installs the shim and the handler in a configuration about to make a web view.
    func install(into configuration: WKWebViewConfiguration, app: String, features: [String]) {
        let controller = configuration.userContentController
        controller.addUserScript(
            WKUserScript(
                source: Shell.shim(app: app, features: features),
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true,
                in: .page))
        controller.add(self, contentWorld: .page, name: "ltw")
    }

    func userContentController(
        _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
    ) {
        guard message.frameInfo.isMainFrame,
            Self.origin(of: message.frameInfo.securityOrigin) == origin(),
            let text = message.body as? String,
            let parsed = PageMessage.parse(text)
        else { return }
        onMessage(parsed)
    }

    /// A frame's security origin as the shell writes origins, or nil when it is none a game has.
    static func origin(of source: WKSecurityOrigin) -> String? {
        Origins.normalize(
            "\(source.protocol)://\(source.host)" + (source.port == 0 ? "" : ":\(source.port)"),
            debug: Shell.debug)
    }

    /// One message to the page, as an argument — never text spliced into script.
    static func send(_ message: ShellMessage, to webView: WKWebView) {
        webView.callAsyncJavaScript(
            "if (window.__ltwNativeReceive) window.__ltwNativeReceive(text);",
            arguments: ["text": message.json],
            in: nil,
            in: .page,
            completionHandler: nil)
    }
}
#endif
