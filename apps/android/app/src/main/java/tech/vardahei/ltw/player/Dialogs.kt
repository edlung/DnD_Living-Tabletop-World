package tech.vardahei.ltw.player

import android.app.Activity
import android.app.AlertDialog
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The shell's questions (docs/adr/0070-native-apps.md §1, §4, §5): which server to play on,
 * whether a code of another server may move the app there, and whether to notify when the table
 * waits.
 */
class Dialogs(private val activity: Activity, private val store: ServerStore) {
    private var notify: AlertDialog? = null

    /**
     * Before the system's question about notifications, the shell's own, saying what they are for.
     * Closed without an answer, it decides nothing.
     */
    fun askToNotify(onContinue: () -> Unit, onLater: () -> Unit) {
        notify = AlertDialog.Builder(activity)
            .setTitle(R.string.notify_title)
            .setMessage(R.string.notify_text)
            .setPositiveButton(R.string.notify_continue) { _, _ -> onContinue() }
            .setNegativeButton(R.string.notify_later) { _, _ -> onLater() }
            .setOnDismissListener { notify = null }
            .show()
    }

    /** The activity is going; its open question goes with it. */
    fun close() {
        notify?.dismiss()
    }

    fun chooseServer(onChosen: () -> Unit) {
        val content = activity.layoutInflater.inflate(R.layout.dialog_server, null)
        val field = content.findViewById<EditText>(R.id.server_field)
        val error = content.findViewById<TextView>(R.id.server_error)
        val list = content.findViewById<LinearLayout>(R.id.server_recent)
        field.setText(store.current)
        val dialog = AlertDialog.Builder(activity)
            .setTitle(R.string.server_title)
            .setView(content)
            .setPositiveButton(R.string.server_connect, null)
            .setNeutralButton(R.string.server_default, null)
            .setNegativeButton(R.string.cancel, null)
            .create()
        val choose = { origin: String ->
            dialog.dismiss()
            store.choose(origin)
            onChosen()
        }
        val recent = store.recent.filter { it != store.current }
        content.findViewById<View>(R.id.server_recent_title).visibility =
            if (recent.isEmpty()) View.GONE else View.VISIBLE
        for (origin in recent) {
            list.addView(
                Button(activity, null, 0, R.style.LTW_Button_Quiet).apply {
                    text = MainActivity.hostOf(origin)
                    setOnClickListener { choose(origin) }
                },
            )
        }
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val origin = Origins.normalize(field.text.toString(), BuildConfig.DEBUG)
                if (origin == null) error.visibility = View.VISIBLE else choose(origin)
            }
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
                choose(BuildConfig.DEFAULT_SERVER)
            }
        }
        dialog.show()
    }

    fun confirmSwitch(origin: String, onConfirmed: () -> Unit) {
        AlertDialog.Builder(activity)
            .setTitle(R.string.switch_title)
            .setMessage(activity.getString(R.string.switch_text, MainActivity.hostOf(origin)))
            .setPositiveButton(R.string.server_connect) { _, _ -> onConfirmed() }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }
}
