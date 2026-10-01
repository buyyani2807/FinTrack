import { fintrackLightTheme } from "../styles/fintrackLightTheme.js";
// Imported as a string and rendered in <style> so it keeps its place in the cascade.
import appStyles from "../styles/app.css?inline";

export function AppShell({ children }) {
  return <div className="app"><style>{appStyles + fintrackLightTheme}</style>{children}</div>;
}

export function LoadingScreen() {
  return <div className="login"><p className="sub" style={{ textAlign: "center" }}>Loading FinTrack…</p></div>;
}
