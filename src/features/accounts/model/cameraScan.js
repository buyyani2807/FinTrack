/** True when this browser can read barcodes from the camera (Chrome on Android and on most computers). */
export function cameraScanSupported() {
  return typeof window !== "undefined"
    && "BarcodeDetector" in window
    && Boolean(navigator.mediaDevices?.getUserMedia);
}
