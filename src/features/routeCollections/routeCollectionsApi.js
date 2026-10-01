import { supabase } from "../../lib/supabase";
import { mapCollectionResult, mapRouteSheet } from "../accounts/model/routeCollectionsModel.js";

// Agent-side calls. These RPCs are scoped to the signed-in agent's routes, so no Accounts company header is sent.
const isMissing = err => /could not find|does not exist|schema cache|404|PGRST202/i.test(String(err?.message || err?.code || ""));

/** Today's route sheet, or null when migration 082 has not been run. */
export const loadAgentRouteSheet = (token, date = null) =>
  supabase.rpc("acc_agent_route_sheet", { input_date: date || null }, token)
    .then(mapRouteSheet)
    .catch(err => {
      if (isMissing(err)) return null;
      throw err;
    });

export const newCollectionRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
};

export const recordRouteCollection = (token, { partyId, amount, mode, reference = "", note = "", requestId }) =>
  supabase.rpc("acc_agent_record_collection", {
    input_party_id: partyId,
    input_amount: Number(amount),
    input_mode: mode,
    input_reference: reference || null,
    input_note: note || null,
    input_client_request_id: requestId || null,
  }, token).then(mapCollectionResult);
