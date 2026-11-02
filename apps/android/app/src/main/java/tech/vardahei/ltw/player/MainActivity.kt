package tech.vardahei.ltw.player

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.net.toUri
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject
import kotlin.math.min

/**
 * LTW Player (docs/adr/0070-native-apps.md): one activity holding the game's WebView and, over
 * it, the shell's start screen — connecting, unreachable, or a WebView too old for the bridge. It
 * answers the page's messages, keeps every navigation on the chosen server, opens scanned codes
 * and links, and turns the system Back into the page's Escape first.
 */
class MainActivity : ComponentActivity(), Game.Host {
    private lateinit var store: ServerStore
    private lateinit var alerts: Alerts
    private lateinit var dialogs: Dialogs
    private var game: Game? = null
    private lateinit var start: View
    private lateinit var status: TextView
    private lateinit var progress: ProgressBar
    private lateinit var retry: Button
    private lateinit var scanButton: Button
    private lateinit var serverButton: Button
    private var shimSource: String? = null
    /** The Back press the page is asked about, numbered so a late answer never decides a later one. */
    private var backAsked: Long? = null
    private var backSequence = 0L
    private val backTimeout = Runnable { backTimedOut() }
    private var files: ValueCallback<Array<Uri>>? = null

    private val scanner = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val text = result.data?.getStringExtra(ScanActivity.EXTRA_TEXT)
        if (result.resultCode == RESULT_OK && text != null) openLink(text)
    }
    private val chooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        files?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        files = null
    }
    private val notifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(getColor(R.color.ink)),
            navigationBarStyle = SystemBarStyle.dark(getColor(R.color.ink)),
        )
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        store = ServerStore(this)
        alerts = Alerts(this)
        dialogs = Dialogs(this, store)
        Alerts.createChannel(this)
        bindStart()
        fitInsets(findViewById(R.id.root))
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = back()
            },
        )
        if (!Game.supported()) {
            showOldWebView()
            return
        }
        game = Game(this, findViewById(R.id.game)).also { it.configure() }
        if (BuildConfig.DEBUG) {
            intent.getStringExtra(EXTRA_SERVER)?.let { Origins.normalize(it, debug = true) }?.let(store::choose)
        }
        startGame()
        // A link opens once: never again from a restored activity or a launch from Recents.
        val fresh = savedInstanceState == null &&
            (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0
        if (fresh) linkOf(intent)?.let(::openLink)
        consumeLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        linkOf(intent)?.let(::openLink)
        consumeLink(intent)
        setIntent(intent)
    }

    override fun onStart() {
        super.onStart()
        alerts.cameBack()
    }

    override fun onStop() {
        alerts.leftView()
        super.onStop()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        fitPanel()
    }

    override fun onDestroy() {
        game?.view?.destroy()
        super.onDestroy()
    }

    /** Plays on the chosen server from its start page. */
    private fun startGame() {
        val origin = store.current
        showConnecting(origin)
        game?.open(origin, "$origin/")
    }

    /** A scanned code or an opened link (ADR 0070 §4): in the game, on another server, or neither. */
    private fun openLink(text: String) {
        val game = game ?: return
        when (val link = Origins.classify(text, game.origin, BuildConfig.DEBUG)) {
            is Origins.Link.Open -> {
                showConnecting(game.origin)
                game.open(game.origin, link.url)
            }
            is Origins.Link.Switch -> dialogs.confirmSwitch(link.origin) {
                store.choose(link.origin)
                showConnecting(link.origin)
                game.open(link.origin, link.url)
            }
            Origins.Link.Reject -> Toast.makeText(this, R.string.not_a_code, Toast.LENGTH_LONG).show()
        }
    }

    override fun onPage(message: PageMessage) {
        when (message) {
            is PageMessage.Haptic -> alerts.haptic(message.kind)
            is PageMessage.Awake -> keepAwake(message.on)
            is PageMessage.Waiting -> alerts.onWaiting(message.count)
            PageMessage.Scan -> scan()
            PageMessage.Server -> dialogs.chooseServer { startGame() }
            is PageMessage.BackResult -> if (backAsked != null && message.id == backAsked) {
                backAsked = null
                start.removeCallbacks(backTimeout)
                if (!message.handled) moveTaskToBack(true)
            }
            // Ready needs no answer here; the TV's messages are LTW DM's alone.
            PageMessage.Ready, is PageMessage.TvCode, is PageMessage.TvPaired, PageMessage.TvUnpaired,
            PageMessage.TvForget -> Unit
        }
    }

    override fun onGameShown() {
        game?.view?.visibility = View.VISIBLE
        start.visibility = View.GONE
    }

    override fun onGameFailed() {
        val origin = game?.origin ?: store.current
        start.visibility = View.VISIBLE
        status.text = getString(R.string.unreachable, hostOf(origin))
        progress.visibility = View.GONE
        retry.visibility = View.VISIBLE
        retry.setText(R.string.retry)
        retry.setOnClickListener {
            showConnecting(origin)
            game?.reload()
        }
        scanButton.visibility = View.VISIBLE
        serverButton.visibility = View.VISIBLE
    }

    /** The WebView's renderer ended: a fresh activity, which opens the game again. */
    override fun onGameGone() = recreate()

    override fun route(url: String): Boolean {
        val origin = game?.origin ?: return true
        return when (Origins.navigation(url, origin, BuildConfig.DEBUG)) {
            Origins.Navigation.INSIDE -> false
            Origins.Navigation.OUTSIDE -> {
                openOutside(url.toUri())
                true
            }
            Origins.Navigation.REFUSE -> true
        }
    }

    override fun chooseFiles(callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
        files?.onReceiveValue(null)
        files = callback
        return try {
            chooser.launch(params.createIntent())
            true
        } catch (_: ActivityNotFoundException) {
            files = null
            false
        }
    }

    override fun shim(): String = shimSource
        ?: Game.shimSource(assets.open("ltw-native.js").bufferedReader().use { it.readText() })
            .also { shimSource = it }

    private fun scan() = scanner.launch(Intent(this, ScanActivity::class.java))

    private fun keepAwake(on: Boolean) {
        if (on) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        if (on && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !store.askedForNotifications) {
            store.askedForNotifications = true
            notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    /** Back is the page's Escape first; nothing closed, the app goes to the background. */
    private fun back() {
        val game = game
        start.removeCallbacks(backTimeout)
        val id = ++backSequence
        val asked = game != null && start.visibility != View.VISIBLE &&
            game.send(JSONObject().put("type", "back").put("id", id))
        if (!asked) {
            backAsked = null
            moveTaskToBack(true)
            return
        }
        backAsked = id
        start.postDelayed(backTimeout, BACK_WAIT_MS)
    }

    private fun backTimedOut() {
        if (backAsked == null) return
        backAsked = null
        moveTaskToBack(true)
    }

    /** A new page of the server: the last one's screen-on and count go with it (ADR 0070 §5). */
    override fun onPageReset() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        alerts.forgetCount()
    }

    /** The link's URL (its token in the fragment) does not stay in the activity's intent. */
    private fun consumeLink(intent: Intent) {
        intent.data = null
        intent.removeExtra(EXTRA_LINK)
    }

    private fun openOutside(uri: Uri) {
        try {
            CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, uri)
        } catch (_: ActivityNotFoundException) {
            // No browser on the device: the link stays unopened.
        }
    }

    private fun bindStart() {
        start = findViewById(R.id.start)
        status = findViewById(R.id.status)
        progress = findViewById(R.id.progress)
        retry = findViewById(R.id.retry)
        scanButton = findViewById(R.id.scan)
        serverButton = findViewById(R.id.server)
        scanButton.setOnClickListener { scan() }
        serverButton.setOnClickListener { dialogs.chooseServer { startGame() } }
        fitPanel()
    }

    /** The panel keeps the sign-in panel's width on a tablet (31rem), the screen's on a phone. */
    private fun fitPanel() {
        val panel = findViewById<View>(R.id.panel)
        val density = resources.displayMetrics.density
        val width = resources.configuration.screenWidthDp - 48
        panel.layoutParams = (panel.layoutParams as FrameLayout.LayoutParams).apply {
            this.width = (min(width, PANEL_DP) * density).toInt()
        }
    }

    private fun showConnecting(origin: String) {
        start.visibility = View.VISIBLE
        status.text = getString(R.string.connecting, hostOf(origin))
        progress.visibility = View.VISIBLE
        retry.visibility = View.GONE
        scanButton.visibility = View.GONE
        serverButton.visibility = View.GONE
    }

    private fun showOldWebView() {
        status.setText(R.string.webview_old)
        progress.visibility = View.GONE
        retry.setText(R.string.update_webview)
        retry.setOnClickListener { openOutside(WEBVIEW_STORE.toUri()) }
        scanButton.visibility = View.GONE
        serverButton.visibility = View.GONE
    }

    /** An opened link; in debug builds also the emulator journeys' `--es link …`. */
    private fun linkOf(intent: Intent?): String? = intent?.takeIf { it.action == Intent.ACTION_VIEW }?.dataString
        ?: intent?.getStringExtra(EXTRA_LINK)?.takeIf { BuildConfig.DEBUG }

    companion object {
        /** Debug builds only: the server to play on, for the emulator's journeys. */
        const val EXTRA_SERVER = "server"
        const val EXTRA_LINK = "link"
        private const val BACK_WAIT_MS = 600L
        private const val PANEL_DP = 496
        private const val WEBVIEW_STORE = "https://play.google.com/store/apps/details?id=com.google.android.webview"

        fun hostOf(origin: String): String = origin.toUri().authority ?: origin

        /** The views keep inside the system bars, the cutout and the keyboard (edge to edge). */
        fun fitInsets(root: View) {
            ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
                val bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() or
                        WindowInsetsCompat.Type.displayCutout() or
                        WindowInsetsCompat.Type.ime(),
                )
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                WindowInsetsCompat.CONSUMED
            }
        }
    }
}
