import test from "node:test";
import assert from "node:assert/strict";
import { agentCredentialError, createAgentPin, internalAgentEmail, temporaryAuthPassword } from "../api/lib/agentPortal.js";

test("agent PIN is 6 digits", () => {
  const pin = createAgentPin();
  assert.match(pin, /^\d{6}$/);
});

test("agent auth email is internal and not a contact address", () => {
  const email = internalAgentEmail();
  assert.match(email, /^agent\.[a-f0-9]{24}@staff\.fintrack\.invalid$/);
});

test("temporary auth password is long enough for the hidden account", () => {
  assert.ok(temporaryAuthPassword().length >= 24);
});

test("a missing agent portal migration is named in the error", () => {
  const message = agentCredentialError(new Error("Could not find the function public.issue_agent_portal_credential in the schema cache"));
  assert.match(message, /091_agent_portal_login\.sql/);
});
