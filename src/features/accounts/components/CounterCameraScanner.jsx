import { useEffect, useRef, useState } from "react";
import { Modal } from "./AccUi.jsx";

const WANTED_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];
/** The same label held in front of the camera is read many times a second; add it once. */
const REPEAT_GAP_MS = 1500;
const SCAN_EVERY_MS = 200;

/**
 * Reads barcodes with the device camera and hands each code to `onCode`.
 * `onCode(code)` returns the text to show for that scan, e.g. "Added Toor Dal".
 * Stays open so several items can be scanned one after another.
 */
export function CounterCameraScanner({ onCode, onClose }) {
  const videoRef = useRef(null);
  const onCodeRef = useRef(onCode);
  const [status, setStatus] = useState("Starting the camera…");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let stopped = false;
    let stream = null;
    let timer = null;
    let lastCode = "";
    let lastAt = 0;

    const start = async () => {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = WANTED_FORMATS.filter(format => supported.includes(format));
        const detector = new window.BarcodeDetector(formats.length ? { formats } : undefined);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus("Point the camera at a barcode.");
        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const found = await detector.detect(video);
              const code = String(found?.[0]?.rawValue || "").trim();
              const now = Date.now();
              if (code && (code !== lastCode || now - lastAt > REPEAT_GAP_MS)) {
                lastCode = code;
                lastAt = now;
                const message = onCodeRef.current?.(code);
                if (!stopped && message) setStatus(message);
              }
            }
          } catch {
            // A frame that cannot be read is skipped; the next one is tried.
          }
          if (!stopped) timer = window.setTimeout(tick, SCAN_EVERY_MS);
        };
        tick();
      } catch (error) {
        if (stopped) return;
        setProblem(
          error?.name === "NotAllowedError"
            ? "Camera permission was refused. Allow the camera for this site, then open the scanner again."
            : error?.name === "NotFoundError"
              ? "No camera was found on this device."
              : "The camera could not be started. You can still type or use a barcode scanner.",
        );
      }
    };
    start();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  return (
    <Modal
      title="Scan barcode"
      close={onClose}
      actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={onClose}>Done</button></div>}
    >
      {problem ? (
        <p className="acc-form-error" role="alert">{problem}</p>
      ) : (
        <div className="counter-scan">
          <video ref={videoRef} className="counter-scan-video" muted playsInline aria-label="Camera preview" />
          <p className="counter-scan-status" role="status" aria-live="polite">{status}</p>
        </div>
      )}
    </Modal>
  );
}
