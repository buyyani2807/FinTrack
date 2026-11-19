/**
 * True when this device has a camera the browser can open. Barcodes are read with the
 * browser's own BarcodeDetector where it exists (Chrome, Android) and with a bundled
 * reader everywhere else (Safari on iPhone/iPad/Mac, Firefox).
 */
export function cameraScanSupported() {
  return typeof window !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Returns a BarcodeDetector class: the browser's own, or the bundled one, loaded on first use. */
export async function loadBarcodeDetector() {
  if (typeof window !== "undefined" && "BarcodeDetector" in window) return window.BarcodeDetector;
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  // Load the reader from this site, not a CDN, so the site's security policy allows it.
  prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
  });
  return BarcodeDetector;
}
