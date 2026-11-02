import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** The light margin around the code that scanners need (ISO/IEC 18004: four modules). */
const QUIET = 4;

/**
 * A link as a QR code (Stage 600): a phone at the table opens an invitation or a reset link from
 * the DM's screen. Exact markup, never an illustration: dark modules on a light plate in every
 * theme, error correction M, the quiet zone included.
 */
export function QrCode({ text, label }: { readonly text: string; readonly label: string }) {
  const { size, path } = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(text, 'Byte');
    code.make();
    const count = code.getModuleCount();
    const modules: string[] = [];
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (code.isDark(row, column)) {
          modules.push(`M${String(column + QUIET)} ${String(row + QUIET)}h1v1h-1z`);
        }
      }
    }
    return { size: count + 2 * QUIET, path: modules.join('') };
  }, [text]);
  return (
    <svg
      className="qr-code"
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect className="qr-code-plate" width={size} height={size} />
      <path className="qr-code-modules" d={path} />
    </svg>
  );
}
