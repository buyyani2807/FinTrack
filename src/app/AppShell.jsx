// Imported as strings and rendered in <style> so they keep their place in the cascade:
// the base layout first, then the design system (tokens, light/dark themes, components).
import appStyles from "../styles/app.css?inline";
import designSystem from "../styles/finebank.css?inline";
import { AppHeaderFrame } from "../components/AppHeader.jsx";

// `header` is off for signed-out screens (sign-in, password reset, legal, pay links).
export function AppShell({ children, header = true }) {
  return <div className={`app${header ? "" : " ft-no-header"}`}><style>{appStyles + designSystem}</style>{header ? <AppHeaderFrame>{children}</AppHeaderFrame> : children}</div>;
}

export function LoadingScreen() {
  return <div className="login"><p className="sub" style={{ textAlign: "center" }}>Loading FinTrack…</p></div>;
}
