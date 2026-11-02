package tech.vardahei.ltw.player

import android.content.Context
import androidx.core.content.edit

/**
 * The one thing the shell stores (docs/adr/0070-native-apps.md §3): the server the app plays on
 * and the last few chosen, as origins — never a token, a URL with a fragment or world data.
 */
class ServerStore(context: Context) {
    private val prefs = context.getSharedPreferences("server", Context.MODE_PRIVATE)

    /** The chosen server, else the owner's deployment. */
    val current: String
        get() = prefs.getString(CURRENT, null)?.let { Origins.normalize(it, BuildConfig.DEBUG) }
            ?: BuildConfig.DEFAULT_SERVER

    /** The servers chosen before, latest first, the current one included. */
    val recent: List<String>
        get() = prefs.getString(RECENT, null).orEmpty().lines()
            .mapNotNull { Origins.normalize(it, BuildConfig.DEBUG) }
            .distinct()

    fun choose(origin: String) {
        val list = (listOf(origin) + recent).distinct().take(MAX_RECENT)
        prefs.edit {
            putString(CURRENT, origin)
            putString(RECENT, list.joinToString("\n"))
        }
    }

    fun reset() = choose(BuildConfig.DEFAULT_SERVER)

    /** The notification permission is asked once, when a session first keeps the screen on. */
    var askedForNotifications: Boolean
        get() = prefs.getBoolean(ASKED, false)
        set(value) = prefs.edit { putBoolean(ASKED, value) }

    private companion object {
        const val CURRENT = "current"
        const val RECENT = "recent"
        const val ASKED = "asked-notifications"
        const val MAX_RECENT = 5
    }
}
