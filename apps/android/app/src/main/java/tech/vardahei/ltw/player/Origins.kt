package tech.vardahei.ltw.player

import java.net.URI
import java.net.URISyntaxException
import java.util.Locale

/**
 * The server the app plays on and the links it opens (docs/adr/0070-native-apps.md §1, §4); the
 * cases are `apps/native-shim/cases.json`. Debug builds also play on a loopback `http` server,
 * the only one whose cookie the server sets without `Secure`.
 */
object Origins {
    private val TOKEN = Regex("^[A-Za-z0-9_-]{43}$")
    private val HOST = Regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$")
    private val LOOPBACK = setOf("localhost", "127.0.0.1")
    private val LINK_PATHS = setOf("", "/", "/table", "/table/", "/join", "/join/", "/reset", "/reset/")

    /** What a scanned code or an opened link asks for. */
    sealed interface Link {
        /** A link of the server the app plays on: open it in the game. */
        data class Open(val url: String) : Link

        /** A link of another server: ask first, then play there. */
        data class Switch(val origin: String, val url: String) : Link

        /** Not a table's code. */
        data object Reject : Link
    }

    /** Where a navigation of the game's view may go. */
    enum class Navigation { INSIDE, OUTSIDE, REFUSE }

    /** A typed server as its origin, `https://host[:port]`, or null. */
    fun normalize(input: String, debug: Boolean): String? {
        val text = input.trim()
        if (text.isEmpty()) return null
        val uri = parse(if (text.contains("://")) text else "https://$text") ?: return null
        return originOf(uri, debug)
    }

    /** A scanned code or an opened link, against the server the app plays on. */
    fun classify(text: String, current: String, debug: Boolean): Link {
        val uri = parse(text.trim()) ?: return Link.Reject
        if (uri.rawQuery != null) return Link.Reject
        val origin = originOf(uri, debug) ?: return Link.Reject
        val path = uri.rawPath ?: ""
        if (path !in LINK_PATHS) return Link.Reject
        val fragment = uri.rawFragment
        val wellFormed = when (path.trimEnd('/')) {
            "" -> fragment == null
            "/table" -> fragment == null || TOKEN.matches(fragment)
            else -> fragment != null && TOKEN.matches(fragment)
        }
        if (!wellFormed) return Link.Reject
        val url = origin + path.ifEmpty { "/" } + (fragment?.let { "#$it" } ?: "")
        return if (origin == current) Link.Open(url) else Link.Switch(origin, url)
    }

    /** The game's view stays on its server; other web addresses open outside; nothing else. */
    fun navigation(url: String, current: String, debug: Boolean): Navigation {
        val uri = parse(url) ?: return Navigation.REFUSE
        return when (uri.scheme?.lowercase(Locale.ROOT)) {
            "http", "https" ->
                if (originOf(uri, debug) == current) Navigation.INSIDE else Navigation.OUTSIDE
            else -> Navigation.REFUSE
        }
    }

    private fun parse(text: String): URI? = try {
        URI(text)
    } catch (_: URISyntaxException) {
        null
    }

    private fun originOf(uri: URI, debug: Boolean): String? {
        val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: return null
        if (uri.rawUserInfo != null) return null
        // The same hosts and ports as the Swift parser: names and IPv4 only, a port of 1–65535.
        val host = uri.host?.lowercase(Locale.ROOT)?.takeIf(HOST::matches) ?: return null
        val port = uri.port
        if (uri.rawAuthority?.endsWith(":") == true || port == 0 || port > 65535) return null
        return when {
            scheme == "https" -> "https://$host" + if (port == -1 || port == 443) "" else ":$port"
            scheme == "http" && debug && host in LOOPBACK ->
                "http://$host" + if (port == -1 || port == 80) "" else ":$port"
            else -> null
        }
    }
}
