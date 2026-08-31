#!/usr/bin/env node
import { runLiveAuctionAgentSuite } from "../src/features/chitFund/liveAuctionAgent.js";

const remoteRequested = String(process.env.FINTRACK_LIVE_AUCTION_TEST || "").toLowerCase() === "staging";

if (remoteRequested) {
  console.error(JSON.stringify({
    ok: false,
    error: "Remote staging mode is disabled in this runner so production schemes, members, payments, reports, and notifications cannot be created. Set credentials only in your secret manager if you later add a dedicated staging project; do not pass them on the command line.",
  }, null, 2));
  process.exit(2);
}

const report = await runLiveAuctionAgentSuite();
const printable = {
  environment: {
    mode: report.environment.mode,
    productionDataModified: report.environment.productionDataModified,
    notificationsSent: report.environment.notificationsSent,
    paymentGatewayUsed: report.environment.paymentGatewayUsed,
    memberCount: report.environment.memberCount,
    chitValue: report.environment.scheme.chitValue,
    runAt: report.environment.runAt,
  },
  scenarios: report.scenarios.map(row => ({ id: row.id, name: row.name, status: row.status, ms: row.ms, detail: row.detail })),
  concurrency: report.concurrency,
  settlement: report.settlement,
  defects: report.defects,
  conclusion: report.conclusion,
};

console.log(JSON.stringify(printable, null, 2));
process.exit(report.conclusion.isolatedWorkflow === "pass" ? 0 : 1);
