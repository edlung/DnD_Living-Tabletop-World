package tech.vardahei.ltw.player

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.ReaderException
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * The QR scanner (docs/adr/0070-native-apps.md §4): the page may not use the camera, so the shell
 * reads the table's code itself (CameraX and ZXing, nothing leaves the device) and hands the text
 * back; the activity that asked decides what it is. The text is never logged.
 */
class ScanActivity : ComponentActivity() {
    private lateinit var executor: ExecutorService
    private var found = false

    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startCamera() else findViewById<TextView>(R.id.scan_text).setText(R.string.camera_needed)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(getColor(R.color.ink_deep)),
            navigationBarStyle = SystemBarStyle.dark(getColor(R.color.ink_deep)),
        )
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_scan)
        MainActivity.fitInsets(findViewById(R.id.scan_root))
        executor = Executors.newSingleThreadExecutor()
        findViewById<Button>(R.id.scan_close).setOnClickListener { finish() }
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) startCamera() else permission.launch(Manifest.permission.CAMERA)
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            val provider = future.get()
            val preview = Preview.Builder().build()
            preview.setSurfaceProvider(findViewById<PreviewView>(R.id.preview).surfaceProvider)
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(executor, QrAnalyzer { text -> runOnUiThread { finishWith(text) } })
            provider.unbindAll()
            provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
        }, ContextCompat.getMainExecutor(this))
    }

    private fun finishWith(text: String) {
        if (found) return
        found = true
        setResult(RESULT_OK, Intent().putExtra(EXTRA_TEXT, text))
        finish()
    }

    companion object {
        const val EXTRA_TEXT = "text"
    }
}

/** Reads a QR code from the camera's luminance plane. */
private class QrAnalyzer(private val onFound: (String) -> Unit) : ImageAnalysis.Analyzer {
    private val reader = QrReader()

    override fun analyze(image: ImageProxy) {
        try {
            val plane = image.planes[0]
            val buffer = plane.buffer
            val data = ByteArray(buffer.remaining()).also { buffer.get(it) }
            reader.read(data, plane.rowStride, image.width, image.height)?.let(onFound)
        } finally {
            image.close()
        }
    }
}

/** A QR code in a luminance plane whose rows are `rowStride` bytes apart, or null (tested on the JVM). */
class QrReader {
    private val reader = QRCodeReader()
    private val hints = mapOf(DecodeHintType.TRY_HARDER to true)

    fun read(luminance: ByteArray, rowStride: Int, width: Int, height: Int): String? = try {
        val source = PlanarYUVLuminanceSource(luminance, rowStride, height, 0, 0, width, height, false)
        reader.decode(BinaryBitmap(HybridBinarizer(source)), hints).text
    } catch (_: ReaderException) {
        null
    } finally {
        reader.reset()
    }
}
