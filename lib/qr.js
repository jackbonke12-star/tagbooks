// QR helper: turn a URL into a crisp, theme-colored SVG string.
//
// Uses qrcode-generator (pure JS, zero transitive deps). We build the SVG by
// hand from the module matrix so it is true vector: no external image service,
// scales infinitely, and prints razor-sharp on a physical coin.
//
// Settings: typeNumber 0 (auto-fit the version to the data length) and error
// correction level 'H' (highest, ~30% recovery) so the code still scans after
// wear/scuffing on a round NFC coin.

import qrcode from 'qrcode-generator';

// Near-black ink for dark modules; paper/background stays transparent so the
// tile behind it (paper theme on screen, white on print) shows through.
const INK = '#1c1a15';
const QUIET = 4; // quiet-zone margin in modules (spec minimum for reliable scan)

// qrSvg(text, opts) -> SVG string, or null for empty/invalid text.
// opts: { color } to override the dark-module color (defaults to ink).
export function qrSvg(text, opts) {
  const data = typeof text === 'string' ? text.trim() : '';
  if (!data) return null;

  const color = (opts && opts.color) || INK;

  let qr;
  try {
    qr = qrcode(0, 'H'); // typeNumber 0 = auto-fit, EC level H = highest
    qr.addData(data);
    qr.make();
  } catch {
    // Data too long for even the largest version, or encoder failure.
    return null;
  }

  const count = qr.getModuleCount();
  const size = count + QUIET * 2;

  // Collect dark modules as SVG rect paths. One <path> keeps the markup small.
  let path = '';
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (qr.isDark(r, c)) {
        const x = c + QUIET;
        const y = r + QUIET;
        path += `M${x} ${y}h1v1h-1z`;
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="100%" height="100%" shape-rendering="crispEdges" ` +
    `role="img" aria-label="QR code linking to the review page">` +
    `<path d="${path}" fill="${color}"/>` +
    `</svg>`
  );
}
