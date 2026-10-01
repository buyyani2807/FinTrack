// Imported as strings and rendered in <style> so they keep their place in the cascade:
// the base layout first, then the design system (tokens, light/dark themes, components).
import appStyles from "../styles/app.css?inline";
import designSystem from "../styles/finebank.css?inline";
import { AppHeader } from "../components/AppHeader.jsx";

export function AppShell({ children }) {
  return <div className="app"><style>{appStyles + designSystem}</style><AppHeader />{children}</div>;
}

export function LoadingScreen() {
  return <div className="login"><p className="sub" style={{ textAlign: "center" }}>Loading FinTrack…</p></div>;
}
