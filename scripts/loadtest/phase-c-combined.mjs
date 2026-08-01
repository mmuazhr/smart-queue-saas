// Phase C — combined realistic peak.
// Holds the phase-B SSE connections (200 customer + 2 merchant) open, and
// WHILE they're held, fires a phase-A-style order burst plus storefront page
// loads. This is the actual lunch-rush shape: live dashboards/customers
// watching while new orders land.
//
// Usage: node scripts/loadtest/phase-c-combined.mjs [--hold=30000] [--burstConcurrency=100] [--port=3100] [--label=run]

import {
  loadFixture,
  findServerPid,
  startRssCpuSampler,
  rssCpuSummary,
  openSseConnection,
  loginMerchant,
  httpPostJson,
  httpGet,
  classify,
  summarizeLatencies,
} from "./lib/common.mjs";
import { writeFileSync, mkdirSync } from "fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);
const holdMs = Number(args.hold ?? 30000);
const burstConcurrency = Number(args.burstConcurrency ?? 100);
const port = Number(args.port ?? 3100);
const label = args.label ?? "run";
const baseUrl = `http://localhost:${port}`;

const fixture = loadFixture();
const storeIds = fixture.stores.map((s) => s.id);
const menuItemIds = storeIds.map((id) => fixture.menuItemIds[id]);
let orderCounter = 0;

async function fireOrder() {
  const idx = orderCounter % storeIds.length;
  const items = menuItemIds[idx];
  const menuItemId = items[orderCounter % items.length];
  orderCounter++;
  const result = await httpPostJson(port, "/api/orders", {
    storeId: storeIds[idx],
    customerPhone: "+6013" + String(1000000 + Math.floor(Math.random() * 8999999)),
    customerName: "Peak Customer",
    items: [{ menuItemId, quantity: 1 }],
  });
  return { ...result, bucket: classify(result) };
}

async function fireStorefrontLoad(slug) {
  const result = await httpGet(port, `/store/${slug}`);
  return { ...result, bucket: classify(result) };
}

function summarizeConns(results, holdMs) {
  const opened = results.filter((r) => r.opened);
  const failed = results.filter((r) => !r.opened);
  const droppedEarly = opened.filter((r) => r.heldMs < holdMs * 0.9);
  return { total: results.length, opened: opened.length, failed: failed.length, droppedEarly: droppedEarly.length };
}

function summarizeBucketed(results) {
  const byBucket = { ok: 0, app: 0, client: 0 };
  for (const r of results) byBucket[r.bucket]++;
  const okLatencies = results.filter((r) => r.bucket === "ok").map((r) => r.elapsed);
  return { total: results.length, byBucket, latencyMsOkOnly: summarizeLatencies(okLatencies) };
}

async function main() {
  const pid = findServerPid(port);
  console.log(`Phase C [${label}] — server PID on :${port} = ${pid ?? "not found"}`);

  const cookies = await Promise.all(fixture.stores.map((s) => loginMerchant(baseUrl, s.ownerEmail, s.password)));
  const customerOrderIds = fixture.stores.flatMap((s) => fixture.orderIds[s.id]);
  const slugs = ["loadtest-store-one", "loadtest-store-two"];

  console.log(`Opening ${customerOrderIds.length} customer + ${fixture.stores.length} merchant SSE connections, holding ${holdMs}ms...`);

  const sampler = pid ? startRssCpuSampler(pid, 1000) : null;
  const wallStart = performance.now();

  // Start SSE connections but don't await yet — they run in the background
  // for the whole holdMs window.
  const customerSsePromise = Promise.all(
    customerOrderIds.map((orderId) => openSseConnection(port, `/api/queue/stream?orderId=${orderId}`, {}, holdMs))
  );
  const merchantSsePromise = Promise.all(
    fixture.stores.map((s, i) => openSseConnection(port, `/api/queue/stream?storeId=${s.id}`, { Cookie: cookies[i] }, holdMs))
  );

  // Give the SSE connections a moment to establish before piling on the burst.
  await new Promise((r) => setTimeout(r, 2000));

  console.log(`Firing order burst (concurrency ${burstConcurrency}) + storefront loads WHILE SSE connections are held...`);
  const [burstResults, storefrontResults] = await Promise.all([
    Promise.all(Array.from({ length: burstConcurrency }, fireOrder)),
    Promise.all(Array.from({ length: 30 }, () => fireStorefrontLoad(slugs[orderCounter % slugs.length]))),
  ]);

  console.log("Burst + storefront loads done, waiting for SSE hold to finish...");
  const [customerResults, merchantResults] = await Promise.all([customerSsePromise, merchantSsePromise]);

  const wallSeconds = (performance.now() - wallStart) / 1000;
  const rssCpuSamples = sampler ? sampler.stop() : [];

  const report = {
    label,
    port,
    pid,
    holdMs,
    burstConcurrency,
    wallSeconds: Number(wallSeconds.toFixed(1)),
    orderBurst: summarizeBucketed(burstResults),
    storefrontLoads: summarizeBucketed(storefrontResults),
    customerSse: summarizeConns(customerResults, holdMs),
    merchantSse: summarizeConns(merchantResults, holdMs),
    serverProcess: rssCpuSummary(rssCpuSamples),
  };

  console.log("\n=== Phase C results ===");
  console.log(JSON.stringify(report, null, 2));

  mkdirSync(new URL("./results", import.meta.url), { recursive: true });
  const outPath = new URL(`./results/phase-c-${label}.json`, import.meta.url);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWritten: ${outPath.pathname}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
