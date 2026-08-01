// Phase B — live-update load with a full board.
// Opens one SSE connection per seeded order (customer view,
// /api/queue/stream?orderId=) plus one merchant dashboard connection per
// store (/api/queue/stream?storeId=), holds them open for holdMs, and
// reports connection outcomes, bytes, the merchant payload size, and
// server RSS/CPU during the hold.
//
// Usage: node scripts/loadtest/phase-b-sse.mjs [--hold=60000] [--port=3100] [--label=run]

import {
  loadFixture,
  findServerPid,
  startRssCpuSampler,
  rssCpuSummary,
  openSseConnection,
  loginMerchant,
} from "./lib/common.mjs";
import { writeFileSync, mkdirSync } from "fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);
const holdMs = Number(args.hold ?? 60000);
const port = Number(args.port ?? 3100);
const label = args.label ?? "run";
const baseUrl = `http://localhost:${port}`;

const fixture = loadFixture();

// A connection counts as "dropped early" only if it closed well before we
// intentionally destroyed it at holdMs — not our own deliberate close.
function summarizeConns(results, holdMs) {
  const opened = results.filter((r) => r.opened);
  const failed = results.filter((r) => !r.opened);
  const droppedEarly = opened.filter((r) => r.heldMs < holdMs * 0.9);
  const totalBytes = results.reduce((s, r) => s + (r.bytes ?? 0), 0);
  const totalEvents = results.reduce((s, r) => s + (r.eventCount ?? 0), 0);
  return {
    total: results.length,
    opened: opened.length,
    failed: failed.length,
    droppedEarly: droppedEarly.length,
    totalBytes,
    totalEvents,
    failedSample: failed.slice(0, 3).map((r) => ({ status: r.status, errorMsg: r.errorMsg, body: r.firstFrame })),
  };
}

async function main() {
  const pid = findServerPid(port);
  console.log(`Phase B [${label}] — server PID on :${port} = ${pid ?? "not found"}, hold ${holdMs}ms`);

  console.log("Logging in merchants...");
  const cookies = await Promise.all(
    fixture.stores.map((s) => loginMerchant(baseUrl, s.ownerEmail, s.password))
  );
  console.log(`  merchant sessions established: ${cookies.filter(Boolean).length}/${fixture.stores.length}`);

  const customerOrderIds = fixture.stores.flatMap((s) => fixture.orderIds[s.id]);
  console.log(`Customer connections to open: ${customerOrderIds.length}`);
  console.log(`Merchant connections to open: ${fixture.stores.length}`);

  const sampler = pid ? startRssCpuSampler(pid, 1000) : null;
  const wallStart = performance.now();

  const customerPromises = customerOrderIds.map((orderId) =>
    openSseConnection(port, `/api/queue/stream?orderId=${orderId}`, {}, holdMs)
  );
  const merchantPromises = fixture.stores.map((s, i) =>
    openSseConnection(port, `/api/queue/stream?storeId=${s.id}`, { Cookie: cookies[i] }, holdMs)
  );

  const [customerResults, merchantResults] = await Promise.all([
    Promise.all(customerPromises),
    Promise.all(merchantPromises),
  ]);

  const wallSeconds = (performance.now() - wallStart) / 1000;
  const rssCpuSamples = sampler ? sampler.stop() : [];

  const customerSummary = summarizeConns(customerResults, holdMs);
  const merchantSummary = summarizeConns(merchantResults, holdMs);

  const merchantFrame = merchantResults.find((r) => r.firstFrame)?.firstFrame ?? null;
  const merchantPayloadBytes = merchantFrame ? Buffer.byteLength(merchantFrame, "utf8") : null;
  let merchantOrderCount = null;
  if (merchantFrame) {
    try {
      merchantOrderCount = JSON.parse(merchantFrame).orders?.length ?? null;
    } catch {
      // leave null
    }
  }

  const report = {
    label,
    port,
    pid,
    holdMs,
    wallSeconds: Number(wallSeconds.toFixed(1)),
    customer: customerSummary,
    merchant: merchantSummary,
    merchantPayload: {
      bytes: merchantPayloadBytes,
      orderCount: merchantOrderCount,
    },
    serverProcess: rssCpuSummary(rssCpuSamples),
  };

  console.log("\n=== Phase B results ===");
  console.log(JSON.stringify(report, null, 2));

  mkdirSync(new URL("./results", import.meta.url), { recursive: true });
  const outPath = new URL(`./results/phase-b-${label}.json`, import.meta.url);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWritten: ${outPath.pathname}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
