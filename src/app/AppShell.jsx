// Imported as strings and rendered in <style> so they keep their place in the cascade:
// the base layout first, then the design system (tokens, light/dark themes, components).
import appStyles from "../styles/app.css?inline";
import designSystem from "../styles/finebank.css?inline";

// `header` is off for signed-out screens (sign-in, password reset, legal, pay links).
export function AppShell({ children }) {
  return <div className="app"><style>{appStyles + designSystem}</style>{children}</div>;
}

// Startup screen: the FINTrack wordmark with F, I and N flipping in turn while "Track" holds its place, over a thin
// progress sweep. Reduced-motion users get a gentle pulse instead.
export function LoadingScreen() {
  return <div className="ft-boot" role="status" aria-live="polite">
    <div className="ft-boot-mark" aria-hidden="true">
      <span className="ft-boot-fin">{["F", "I", "N"].map((letter, index) => <span key={letter} style={{ "--i": index }}>{letter}</span>)}</span>
      <span className="ft-boot-track">Track</span>
    </div>
    <span className="ft-boot-bar" aria-hidden="true"><span /></span>
    <span className="ft-sr-only">Loading FinTrack</span>
  </div>;
}
