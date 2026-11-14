// Email confirmation at signup. When Supabase has "Confirm email" on, signup returns
// no session: the business details wait in the user's metadata and the workspace is
// created on the first sign-in after the owner opens the confirmation link.

export const CLEARED_PENDING_WORKSPACE = {
  pending_business_name: null,
  pending_full_name: null,
  pending_invite_code: null,
};

export function pendingWorkspaceMetadata({ businessName, fullName, inviteCode }) {
  return {
    pending_business_name: String(businessName || "").trim(),
    pending_full_name: String(fullName || "").trim(),
    pending_invite_code: String(inviteCode || "").trim() || null,
  };
}

/** "session": signed in at once. "confirm": confirmation email sent. "exists": email already registered. */
export function signupOutcome(body) {
  if (body?.access_token && body?.refresh_token) return "session";
  const user = body?.user || body;
  // With Confirm email on, Supabase answers a signup for a registered email with a
  // look-alike user that has no identities, and sends no email.
  if (Array.isArray(user?.identities) && user.identities.length === 0) return "exists";
  return "confirm";
}

/** Business details saved at signup and not yet turned into a workspace, or null. */
export function pendingWorkspace(user) {
  const meta = user?.user_metadata || {};
  const businessName = String(meta.pending_business_name || "").trim();
  const fullName = String(meta.pending_full_name || "").trim();
  if (!businessName || !fullName) return null;
  return { businessName, fullName, inviteCode: String(meta.pending_invite_code || "").trim() || null };
}

/** Where the confirmation link lands. The origin must be listed under Supabase Redirect URLs. */
export function confirmationRedirect(origin) {
  const base = String(origin || "").trim().replace(/\/$/, "");
  return base ? `${base}/login?confirmed=1` : "";
}

export function isEmailNotConfirmed(message) {
  return /email not confirmed/i.test(String(message || ""));
}
