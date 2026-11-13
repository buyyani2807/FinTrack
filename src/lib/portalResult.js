// Portal logins return { error } on a wrong PIN (migration 141) so the failed-attempt
// count is kept. Turn that back into a thrown error for the sign-in screen.
export function portalResult(result) {
  if (result && typeof result === "object" && typeof result.error === "string") throw new Error(result.error);
  return result;
}
