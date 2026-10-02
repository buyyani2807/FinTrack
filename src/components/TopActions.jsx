import { Button } from "./ui.jsx";
import { ThemeToggle } from "./ThemeToggle.jsx";

// Theme switch + Log out at the right of a page's top bar, for screens without the workspace sidebar
// (collection agents, customer portals). Owners get both in the sidebar instead (the CSS hides these).
export function TopActions({ logout }) {
  return <div className="top-actions"><ThemeToggle className="top-theme" /><Button onClick={logout}>Log out</Button></div>;
}
