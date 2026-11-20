import { supabase } from "../../lib/supabase.js";

/**
 * Platform-wide signup stats, visible only to the one operator account the
 * server-side `admin_signup_stats` function checks against (see
 * supabase/153_admin_platform_stats.sql). For any other signed-in account
 * this call fails — that's enforced in Postgres, not here, so there's
 * nothing this function can do to grant access it wasn't given.
 */
export async function loadAdminSignupStats(token) {
  return supabase.rpc("admin_signup_stats", {}, token);
}
