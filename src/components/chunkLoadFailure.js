// Shared by ErrorBoundary.jsx. Every route in this app is React.lazy()-loaded (see
// AppRoutes.jsx withLazy), and public/sw.js is a network-first service worker that
// falls back to its cache on any fetch hiccup. Right after a deploy replaces the
// hashed JS chunk filenames, a stale cached index.html can reference a chunk that no
// longer exists on the server — the import() for that route then rejects with one of
// these shapes. That's not a real app bug, so it's handled separately from an
// ordinary crash (auto-reload once, instead of showing the dead-end crash screen).
export function isChunkLoadFailure(error) {
  const message = String(error?.message || "");
  return (
    error?.name === "ChunkLoadError"
    || /dynamically imported module/i.test(message)
    || /loading chunk [\w.-]* failed/i.test(message)
    || /failed to fetch dynamically imported module/i.test(message)
  );
}
