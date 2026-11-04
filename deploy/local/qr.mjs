// The join address as a QR code in the terminal (deploy/local/ltw-local.sh; ADR 0061 §1): the web
// client's own encoder (qrcode-generator, error correction M, a four-module quiet zone), two rows
// of modules per line of half blocks. Prints nothing and fails where the checkout has no
// dependencies installed; the address is printed beside it anyway.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const qrcode = require('qrcode-generator');

const text = process.argv[2];
if (!text) process.exit(2);
const code = qrcode(0, 'M');
code.addData(text, 'Byte');
code.make();
const count = code.getModuleCount();
const QUIET = 4;
const dark = (row, column) =>
  row >= 0 && column >= 0 && row < count && column < count && code.isDark(row, column);
// Black on white whatever the terminal's theme: a scanner reads dark modules on a light plate.
const PLATE = '\u001b[30;47m';
const RESET = '\u001b[0m';
const lines = [];
for (let row = -QUIET; row < count + QUIET; row += 2) {
  let line = '';
  for (let column = -QUIET; column < count + QUIET; column += 1) {
    const top = dark(row, column);
    const bottom = dark(row + 1, column);
    line += top ? (bottom ? '█' : '▀') : bottom ? '▄' : ' ';
  }
  lines.push(`${PLATE}${line}${RESET}`);
}
process.stdout.write(`${lines.join('\n')}\n`);
