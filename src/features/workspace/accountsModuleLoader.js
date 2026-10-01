// Code-split entry for the Accounts product; shared by the route and the idle preload in the workspace layout.
export const loadAccountsModule = () => import("../accounts/AccountingProduct.jsx");
