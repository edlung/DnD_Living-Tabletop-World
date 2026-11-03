package tech.vardahei.ltw.player

import org.json.JSONException
import org.json.JSONObject
import org.json.JSONTokener

/**
 * What the page asks of the shell, protocol version 1 (docs/adr/0070-native-apps.md §2). A message
 * is parsed strictly: an unknown type or a field of the wrong kind is ignored, nothing the page
 * wrote reaches anything that acts on it except these values.
 */
sealed interface PageMessage {
    data object Ready : PageMessage
    data class Haptic(val kind: Kind) : PageMessage {
        enum class Kind { ALERT, DICE }
    }
    data class Awake(val on: Boolean) : PageMessage
    data class Waiting(val count: Int) : PageMessage
    data object Scan : PageMessage
    data object Server : PageMessage
    data class BackResult(val handled: Boolean, val id: Long?) : PageMessage
    data class TvCode(val code: String) : PageMessage
    data class TvPaired(val campaign: String?) : PageMessage
    data object TvUnpaired : PageMessage
    data object TvForget : PageMessage

    companion object {
        private const val MAX_LENGTH = 1024
        private val PAIRING_CODE = Regex("^[A-HJKMNP-Z2-9]{8}$")
        private val CAMPAIGN_ID = Regex("^[A-Za-z0-9._:-]{1,128}$")

        fun parse(text: String): PageMessage? {
            if (text.isEmpty() || text.length > MAX_LENGTH) return null
            val tokener = JSONTokener(text)
            val json = try {
                tokener.nextValue().also { if (tokener.nextClean() != 0.toChar()) return null }
            } catch (_: JSONException) {
                return null
            }
            if (json !is JSONObject) return null
            return when (json.opt("type")) {
                "ready" -> Ready
                "haptic" -> when (json.opt("kind")) {
                    "alert" -> Haptic(Haptic.Kind.ALERT)
                    "dice" -> Haptic(Haptic.Kind.DICE)
                    else -> null
                }
                "awake" -> (json.opt("on") as? Boolean)?.let(::Awake)
                "waiting" -> count(json.opt("count"))?.let(::Waiting)
                "scan" -> Scan
                "server" -> Server
                "back-result" -> backResult(json)
                "tv-code" -> (json.opt("code") as? String)?.takeIf(PAIRING_CODE::matches)?.let(::TvCode)
                "tv-paired" -> when (val campaign = json.opt("campaign")) {
                    null -> TvPaired(null)
                    is String -> campaign.takeIf(CAMPAIGN_ID::matches)?.let(::TvPaired)
                    else -> null
                }
                "tv-unpaired" -> TvUnpaired
                "tv-forget" -> TvForget
                else -> null
            }
        }

        private fun backResult(json: JSONObject): BackResult? {
            val handled = json.opt("handled") as? Boolean ?: return null
            return when (val id = json.opt("id")) {
                null -> BackResult(handled, null)
                is Int -> id.takeIf { it >= 0 }?.let { BackResult(handled, it.toLong()) }
                is Long -> id.takeIf { it >= 0 }?.let { BackResult(handled, it) }
                else -> null
            }
        }

        private fun count(value: Any?): Int? = when (value) {
            is Int -> value.takeIf { it in 0..99 }
            is Long -> value.takeIf { it in 0L..99L }?.toInt()
            else -> null
        }
    }
}
