package tech.vardahei.ltw.player

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject

/**
 * The game's WebView (docs/adr/0070-native-apps.md §1, §2, §7): it opens the chosen server's
 * client, keeps every navigation of the main frame on that origin (other web addresses open
 * outside, anything else is refused), and holds the bridge — a document-start shim and a message
 * listener, both restricted to that origin and to messages of its main frame.
 */
class Game(private val host: Host, val view: WebView) {
    /** What the game asks of the activity around it. */
    interface Host {
        fun onPage(message: PageMessage)
        fun onGameShown()
        fun onPageReset()
        fun onGameFailed()
        fun onGameGone()
        fun route(url: String): Boolean
        fun chooseFiles(callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean
        fun shim(): String
    }

    var origin: String = ""
        private set
    private var script: ScriptHandler? = null
    private var reply: JavaScriptReplyProxy? = null
    private var failed = false

    @SuppressLint("SetJavaScriptEnabled")
    fun configure() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        with(view.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setGeolocationEnabled(false)
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            userAgentString = "$userAgentString LTWPlayer/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(view, false)
        }
        view.webViewClient = Client()
        view.webChromeClient = Chrome()
    }

    /** Opens a URL of `origin`, binding the bridge to it first when the server changed. */
    fun open(origin: String, url: String) {
        failed = false
        if (origin != this.origin) bind(origin)
        if (this.origin != origin) {
            host.onGameFailed()
            return
        }
        view.loadUrl(url)
    }

    fun reload() {
        failed = false
        view.reload()
    }

    /** One message to the page; false when no page of the server has said it is ready. */
    fun send(message: JSONObject): Boolean {
        val proxy = reply ?: return false
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false
        proxy.postMessage(message.toString())
        return true
    }

    @SuppressLint("RequiresFeature") // Both features are checked first, below.
    private fun bind(origin: String) {
        // The activity never makes a game without both features (`supported`); checked here again,
        // since the bridge must never exist unrestricted.
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        ) {
            return
        }
        script?.remove()
        script = null
        if (this.origin.isNotEmpty()) WebViewCompat.removeWebMessageListener(view, BRIDGE)
        reply = null
        this.origin = origin
        val rules = setOf(origin)
        try {
            WebViewCompat.addWebMessageListener(view, BRIDGE, rules) { _, message, source, isMainFrame, proxy ->
                val fromServer = Origins.normalize(source.toString(), BuildConfig.DEBUG) == this.origin
                val parsed = message.data?.let(PageMessage::parse)
                if (isMainFrame && fromServer && parsed != null) {
                    reply = proxy
                    host.onPage(parsed)
                }
            }
            script = WebViewCompat.addDocumentStartJavaScript(view, host.shim(), rules)
        } catch (_: IllegalArgumentException) {
            // An origin the WebView refuses as a rule: no bridge, and no page either.
            this.origin = ""
            failed = true
        }
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            request.isForMainFrame && host.route(request.url.toString())

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            reply = null
            host.onPageReset()
        }

        override fun onPageFinished(view: WebView, url: String) {
            val inside = Origins.navigation(url, origin, BuildConfig.DEBUG) == Origins.Navigation.INSIDE
            if (!failed && inside) host.onGameShown()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            failed = true
            host.onGameFailed()
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            if (!request.isForMainFrame || response.statusCode < 500) return
            failed = true
            host.onGameFailed()
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            host.onGameGone()
            return true
        }
    }

    private inner class Chrome : WebChromeClient() {
        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean = host.chooseFiles(filePathCallback, fileChooserParams)

        // The page's policy asks for no camera, microphone or place; nothing is granted.
        override fun onPermissionRequest(request: PermissionRequest) = request.deny()

        override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) =
            callback.invoke(origin, false, false)
    }

    companion object {
        const val BRIDGE = "ltwNativeBridge"

        /** The features LTW Player offers the page. */
        val FEATURES = listOf("haptics", "awake", "waiting", "scan", "server", "back")

        /** Whether this WebView can hold the bridge restricted to one origin (ADR 0070 §2). */
        fun supported(): Boolean =
            WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) &&
                WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)

        /** The shim with this shell's description in place of its placeholder. */
        fun shimSource(template: String): String {
            val config = JSONObject()
                .put("platform", "android")
                .put("app", "player")
                .put("features", JSONArray(FEATURES))
            return template.replace("__LTW_NATIVE_CONFIG__", config.toString())
        }
    }
}
