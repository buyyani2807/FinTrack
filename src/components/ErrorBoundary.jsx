import { Component } from "react";
import { reportError } from "../lib/monitoring.js";

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
