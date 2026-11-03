package tech.vardahei.ltw.player

import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The scanner's decoding (docs/adr/0070-native-apps.md §4): a table's QR code drawn into a camera-like
 * luminance plane, rows padded as a camera pads them, is read back whole; a blank frame is nothing.
 */
class QrReaderTest {
    private val link = "https://ltw.vardahei.tech/table#AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCde"

    private fun plane(text: String?, size: Int, rowStride: Int): ByteArray {
        val plane = ByteArray(rowStride * size) { 0xEE.toByte() }
        if (text == null) return plane
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size)
        for (y in 0 until size) for (x in 0 until size) {
            if (matrix[x, y]) plane[y * rowStride + x] = 0x10
        }
        return plane
    }

    @Test
    fun readsATablesCodeFromAPaddedPlane() {
        assertEquals(link, QrReader().read(plane(link, 480, 512), 512, 480, 480))
    }

    @Test
    fun aFrameWithoutACodeIsNothing() {
        assertNull(QrReader().read(plane(null, 480, 480), 480, 480, 480))
    }
}
