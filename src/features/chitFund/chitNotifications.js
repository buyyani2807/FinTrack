import {
  claimTransactionConfirmation,
  updateTransactionConfirmationStatus,
  recordTransactionConfirmationResend,
} from "../../lib/financeRepository";
import {
  buildChitLiftVariables,
  CONFIRMATION_EVENTS,
  financeConfirmationToast,
  sendTransactionConfirmation,
} from "../receipts/transactionConfirmations.js";

export async function fireChitLiftWhatsApp({ token, settings = {}, workspace = {}, sourceId, payload, resend = false }) {
  try {
    const result = await sendTransactionConfirmation({
      token,
      eventType: CONFIRMATION_EVENTS.chitLift,
      sourceId,
      phone: payload.phone,
      variables: buildChitLiftVariables(payload, settings, workspace),
      settings,
      claimConfirmation: claimTransactionConfirmation,
      updateConfirmationStatus: updateTransactionConfirmationStatus,
      recordResend: recordTransactionConfirmationResend,
      resend,
    });
    return financeConfirmationToast(result);
  } catch {
    return "WhatsApp confirmation could not be sent.";
  }
}
