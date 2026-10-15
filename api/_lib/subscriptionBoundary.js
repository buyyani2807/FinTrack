// Integration boundary for a future payment provider.
// A browser click must not activate a plan. When a provider is connected:
// 1. Verify the webhook signature with a server-only secret (never a VITE_ variable).
// 2. Confirm the event is paid for this organization.
// 3. Call public.activate_paid_subscription as the Supabase service role.
// Until that verification exists, this endpoint changes nothing.

export const SUBSCRIPTION_WEBHOOK_READY = false;

export function subscriptionWebhookResult() {
  return {
    status: 501,
    activatesWorkspace: false,
    body: {
      error: "Payment provider is not connected. This endpoint does not change subscription status.",
    },
  };
}
