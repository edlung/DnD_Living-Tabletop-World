package tech.vardahei.ltw.player

import android.app.Activity
import android.app.AlertDialog
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The shell's two questions (docs/adr/0070-native-apps.md §1, §4): which server to play on, and
 * whether a code of another server may move the app there.
 */
class Dialogs(private val activity: Activity, private val store: ServerStore) {
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
