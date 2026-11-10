import { createContext, useContext } from "react";

// Set by <ModuleParts> on a module overview page. Feature links on that page open the part panel instead of a new page.
export const ModulePartsContext = createContext(null);

// Click handler for a link to a feature: opens the part panel when there is one, otherwise lets the link navigate.
// Modified clicks (new tab, new window) always navigate.
export function usePartLink(slug) {
  const parts = useContext(ModulePartsContext);
  if (!parts || !slug) return undefined;
  return event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    parts.open(slug, event.currentTarget);
  };
}
