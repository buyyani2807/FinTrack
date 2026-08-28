const readEnv = key => {
  if (typeof import.meta !== "undefined" && import.meta.env?.[key] != null && import.meta.env[key] !== "") {
    return import.meta.env[key];
  }
  return process.env[key];
};

export function isPublicSignupAllowed() {
  return readEnv("VITE_ALLOW_PUBLIC_SIGNUP") !== "false";
}

export function signupInviteRequired() {
  return Boolean(String(readEnv("VITE_SIGNUP_INVITE_CODE") || "").trim());
}

export function validateSignupInvite(code) {
  const required = String(readEnv("VITE_SIGNUP_INVITE_CODE") || "").trim();
  if (!required) return true;
  return code?.trim() === required;
}
