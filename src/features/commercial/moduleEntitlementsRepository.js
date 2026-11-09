import { supabase } from "../../lib/supabase.js";

export async function listOrganizationModuleEntitlements(token) {
  try {
    const data = await supabase.rpc("list_organization_module_entitlements", {}, token);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    // Migration not applied yet — treat as no commerce rows (legacy full packs).
    if (/list_organization_module_entitlements|schema cache|does not exist|404|PGRST/i.test(String(error?.message || error?.code || ""))) {
      return [];
    }
    throw error;
  }
}

export async function listModuleProductsCatalog(token) {
  try {
    const data = await supabase.rpc("list_module_products", {}, token);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (/list_module_products|schema cache|does not exist|404|PGRST/i.test(String(error?.message || error?.code || ""))) {
      return null;
    }
    throw error;
  }
}
