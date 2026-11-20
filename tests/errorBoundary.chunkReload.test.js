import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isChunkLoadFailure } from "../src/components/chunkLoadFailure.js";

// Every route is React.lazy()-loaded behind a service worker that can serve a stale
// index.html right after a deploy, pointing at a JS chunk hash that no longer exists.
// That must auto-reload once instead of showing the dead-end crash screen — but only
// for that specific failure shape, never for a real app bug.
test("isChunkLoadFailure recognizes known chunk-load failure shapes", () => {
  assert.equal(isChunkLoadFailure({ name: "ChunkLoadError", message: "Loading chunk 4 failed" }), true);
  assert.equal(isChunkLoadFailure(new Error("Failed to fetch dynamically imported module: https://x/y.js")), true);
  assert.equal(isChunkLoadFailure(new Error("error loading dynamically imported module")), true);
  assert.equal(isChunkLoadFailure(new Error("Loading chunk vendor-abc123 failed.")), true);
});

test("isChunkLoadFailure does not misfire on an ordinary app error", () => {
  assert.equal(isChunkLoadFailure(new TypeError("Cannot read properties of undefined (reading 'map')")), false);
  assert.equal(isChunkLoadFailure(new Error("Network request failed")), false);
  assert.equal(isChunkLoadFailure(null), false);
  assert.equal(isChunkLoadFailure(undefined), false);
});

test("componentDidCatch reloads once via a sessionStorage guard, and still reports real errors to monitoring", () => {
  const source = readFileSync(new URL("../src/components/ErrorBoundary.jsx", import.meta.url), "utf8");
  assert.match(source, /sessionStorage\.getItem\(RELOAD_FLAG\)/);
  assert.match(source, /sessionStorage\.setItem\(RELOAD_FLAG, "1"\)/);
  assert.match(source, /window\.location\.reload\(\)/);
  assert.match(source, /reportError\(error, \{ componentStack: info\?\.componentStack \|\| "" \}\);/);
});
