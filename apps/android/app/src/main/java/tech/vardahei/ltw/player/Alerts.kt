package tech.vardahei.ltw.player

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * The alerts the page cannot give alone (docs/adr/0070-native-apps.md §5): a vibration, and while
 * the app is out of view a notification when more waits for the player — or one reminder a minute
 * after leaving with something waiting. Every notification says only "The table is waiting for
 * you": a private check never shows on a lock screen. No push service.
 */
class Alerts(private val context: Context) {
    private var waiting: Int? = 0
    private var inView = true

    fun haptic(kind: PageMessage.Haptic.Kind) {
        val vibrator = vibrator() ?: return
        if (!vibrator.hasVibrator()) return
        val effect = when (kind) {
            PageMessage.Haptic.Kind.ALERT ->
                VibrationEffect.createWaveform(longArrayOf(0, 160, 80, 160), -1)
            PageMessage.Haptic.Kind.DICE ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
                } else {
                    VibrationEffect.createOneShot(18, VibrationEffect.DEFAULT_AMPLITUDE)
                }
        }
        vibrator.vibrate(effect)
    }

    /** The page's count of what waits; a rise while out of view is news. */
    fun onWaiting(count: Int) {
        val baseline = waiting
        waiting = count
        if (baseline == null) return
        if (!inView && count > baseline) notifyWaiting(context)
        if (count == 0) {
            reminder()?.let { alarms().cancel(it) }
            NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        }
    }

    /** A new page starts counting afresh: its first count is a baseline, never news. */
    fun forgetCount() {
        waiting = null
    }

    fun leftView() {
        inView = false
        if ((waiting ?: 0) > 0) scheduleReminder()
    }

    fun cameBack() {
        inView = true
        reminder()?.let { alarms().cancel(it) }
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    private fun scheduleReminder() {
        val pending = reminder(create = true) ?: return
        alarms().setAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + REMINDER_MS,
            pending,
        )
    }

    private fun reminder(create: Boolean = false): PendingIntent? = PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, ReminderReceiver::class.java),
        PendingIntent.FLAG_IMMUTABLE or if (create) PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_NO_CREATE,
    )

    private fun alarms() = context.getSystemService(AlarmManager::class.java)

    private fun vibrator(): Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Vibrator::class.java)
    }

    companion object {
        private const val CHANNEL = "table"
        private const val NOTIFICATION_ID = 1
        private const val REMINDER_MS = 60_000L

        fun createChannel(context: Context) {
            val channel = NotificationChannel(
                CHANNEL,
                context.getString(R.string.channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply { description = context.getString(R.string.channel_text) }
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        fun notifyWaiting(context: Context) {
            val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
            if (!granted) return
            val open = PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE,
            )
            val notification = NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(ContextCompat.getColor(context, R.color.gold))
                .setContentTitle(context.getString(R.string.waits_title))
                .setContentText(context.getString(R.string.waits_text))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            try {
                NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
            } catch (_: SecurityException) {
                // The permission went away meanwhile: no notification.
            }
        }
    }
}

/** The reminder a minute after the player left the app with something waiting. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Alerts.notifyWaiting(context)
    }
}
