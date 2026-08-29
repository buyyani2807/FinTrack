export function isPublicSignupAllowed() {
  return import.meta.env.VITE_ALLOW_PUBLIC_SIGNUP !== "false";
}

export function signupInviteRequired() {
  return Boolean(String(import.meta.env.VITE_SIGNUP_INVITE_CODE || "").trim());
}

export function validateSignupInvite(code) {
  const required = String(import.meta.env.VITE_SIGNUP_INVITE_CODE || "").trim();
  if (!required) return true;
  return code?.trim() === required;
}
