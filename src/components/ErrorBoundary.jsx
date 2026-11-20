import { Component } from "react";
import { isChunkLoadFailure } from "./chunkLoadFailure.js";
import { reportError } from "../lib/monitoring.js";

// A reload fetches a fresh index.html with matching chunk hashes, which is exactly why
// "reload fixes it" for a stale-chunk crash (see chunkLoadFailure.js). Reload once
// automatically for that specific shape instead of showing a dead-end screen for
// something the user would just reload away anyway. RELOAD_FLAG stops a reload loop if
// the deploy itself is broken and every chunk genuinely 404s.
const RELOAD_FLAG = "ft_chunk_reload_once";

/** Last-resort crash screen. Reports the error (scrubbed) and offers a reload. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    if (isChunkLoadFailure(error) && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
      return;
    }
    reportError(error, { componentStack: info?.componentStack || "" });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="shell" role="alert">
        <h1 className="title">Something went wrong</h1>
        <p className="copy">This screen stopped working. Your saved records are not affected. Reload to continue.</p>
        <div className="row spacer">
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </main>
    );
  }
}
