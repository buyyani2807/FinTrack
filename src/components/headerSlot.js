import { createContext, useContext } from "react";

// Lets a page place its breadcrumb in the app header. The value only carries stable show/hide
// functions, so pages are not re-rendered when the header content changes.
export const HeaderSlotContext = createContext(null);
export const useHeaderSlot = () => useContext(HeaderSlotContext);
