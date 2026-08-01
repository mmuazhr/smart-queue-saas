// Sequential-only payload/cost measurements (team-lead redirect, 2026-08-02).
// No concurrency anywhere in this script — every request is awaited before
// the next one starts, by design: this is meant to be reliable on a fragile
// shared daemon and to isolate query/serialization cost from connection
// contention.
//
// Measures:
//   1. Merchant SSE payload size at ~100 active orders + bandwidth/dashboard
//   2. Customer SSE payload size for a single order
//   3. Sequential timing (p50/p95, ~20 samples) of GET /api/orders and of the
//      storeId SSE stream's first frame (the heavy per-poll query)
//   4. Payload growth curve at 10 / 50 / 100 active orders
//
// Usage: node scripts/loadtest/sequential-payload.mjs [--port=3100]

import "dotenv/config";
import { loadFixture, httpGet, summarizeLatencies, loginMerchant } from "./lib/common.mjs";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);
const port = Number(args.port ?? 3100);
const baseUrl = `http://localhost:${port}`;

const fixture = loadFixture();
const store = fixture.stores[0];
const orderIds = fixture.orderIds[store.id];
const prisma = new PrismaClient();

// Reads chunks until one complete "\n\n"-terminated SSE frame has arrived —
// a single reader.read() only returns one TCP chunk (~64KB), which truncates
// anything larger (the 100-order merchant payload is ~115KB).
async function readOneFrame(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf8");
  let buf = "";
  while (!buf.includes("\n\n")) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  await reader.cancel();
  const frame = buf.split("\n\n")[0].replace(/^data:\s*/, "");
  return frame;
}

async function getStoreFrame(cookie) {
  const res = await fetch(`${baseUrl}/api/queue/stream?storeId=${store.id}`, { headers: { Cookie: cookie } });
  return readOneFrame(res);
}

async function getOrderFrame(orderId) {
  const res = await fetch(`${baseUrl}/api/queue/stream?orderId=${orderId}`);
  return readOneFrame(res);
}

async function main() {
  console.log("Logging in merchant (sequential)...");
  const cookie = await loginMerchant(baseUrl, store.ownerEmail, store.password);

  // --- 1. Merchant SSE payload at ~100 active orders ---
  console.log("\n--- 1. Merchant SSE payload (100 active orders) ---");
  const merchantFrame = await getStoreFrame(cookie);
  const merchantBytes = Buffer.byteLength(merchantFrame, "utf8");
  const merchantOrders = JSON.parse(merchantFrame).orders;
  const merchantOrderCount = merchantOrders.length;
  const perOrderAvg = merchantBytes / merchantOrderCount;
  const pollsPerMinute = 20; // 3s interval
  const kbPerMinutePerDashboard = (merchantBytes * pollsPerMinute) / 1024;
  console.log(`  bytes: ${merchantBytes} (${(merchantBytes / 1024).toFixed(1)} KB)`);
  console.log(`  orders in payload: ${merchantOrderCount}`);
  console.log(`  avg bytes/order: ${perOrderAvg.toFixed(1)}`);
  console.log(`  bandwidth/dashboard: ${kbPerMinutePerDashboard.toFixed(1)} KB/min at 3s polling`);

  // --- 2. Customer SSE payload for a single order ---
  console.log("\n--- 2. Customer SSE payload (single order) ---");
  const customerFrame = await getOrderFrame(orderIds[0]);
  const customerBytes = Buffer.byteLength(customerFrame, "utf8");
  console.log(`  bytes: ${customerBytes}`);
  console.log(`  frame: ${customerFrame}`);
  console.log(`  ratio merchant/customer: ${(merchantBytes / customerBytes).toFixed(1)}x`);

  // --- 3. Sequential query-cost timing, ~20 samples each ---
  console.log("\n--- 3. Sequential query cost (20 samples each, no concurrency) ---");
  const getOrdersLatencies = [];
  for (let i = 0; i < 20; i++) {
    const r = await httpGet(port, `/api/orders?storeId=${store.id}&status=AWAITING_CONFIRMATION,PAID,ACCEPTED,PREPARING,READY`, {
      Cookie: cookie,
    });
    getOrdersLatencies.push(r.elapsed);
  }
  console.log(`  GET /api/orders (full board, ${merchantOrderCount} orders): ${JSON.stringify(summarizeLatencies(getOrdersLatencies))}`);

  const streamTtfbLatencies = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    const res = await fetch(`${baseUrl}/api/queue/stream?storeId=${store.id}`, { headers: { Cookie: cookie } });
    const reader = res.body.getReader();
    await reader.read(); // time to first frame = time to run the heavy query + serialize
    const elapsed = performance.now() - start;
    await reader.cancel();
    streamTtfbLatencies.push(elapsed);
  }
  console.log(`  storeId SSE stream time-to-first-frame: ${JSON.stringify(summarizeLatencies(streamTtfbLatencies))}`);

  // --- 4. Payload growth curve: 10 / 50 / 100 active orders ---
  console.log("\n--- 4. Payload growth curve (10 / 50 / 100 active orders) ---");
  // Move all-but-N orders for this store to COMPLETED (out of the active-status
  // set the stream query filters on), measure, then restore. Sequential,
  // single connection throughout — safe on any daemon.
  const activeStatuses = ["AWAITING_CONFIRMATION", "PAID", "ACCEPTED", "PREPARING", "READY"];
  const allActive = await prisma.order.findMany({
    where: { storeId: store.id, status: { in: activeStatuses } },
    select: { id: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  const originalStatuses = new Map(allActive.map((o) => [o.id, o.status]));

  async function setActiveCount(n) {
    const toKeep = new Set(allActive.slice(0, n).map((o) => o.id));
    const toHide = allActive.filter((o) => !toKeep.has(o.id)).map((o) => o.id);
    const toRestore = allActive.filter((o) => toKeep.has(o.id)).map((o) => o.id);
    if (toHide.length) {
      await prisma.order.updateMany({ where: { id: { in: toHide } }, data: { status: "COMPLETED" } });
    }
    for (const id of toRestore) {
      await prisma.order.update({ where: { id }, data: { status: originalStatuses.get(id) } });
    }
  }

  const growthCurve = [];
  for (const n of [10, 50, 100]) {
    await setActiveCount(n);
    const frame = await getStoreFrame(cookie);
    const bytes = Buffer.byteLength(frame, "utf8");
    const actualCount = JSON.parse(frame).orders.length;
    growthCurve.push({ requestedActive: n, actualActive: actualCount, bytes, bytesPerOrder: Number((bytes / actualCount).toFixed(1)) });
    console.log(`  n=${n}: actual=${actualCount} orders, ${bytes} bytes (${(bytes / actualCount).toFixed(1)} bytes/order)`);
  }
  // restore full board
  await setActiveCount(allActive.length);

  const report = {
    port,
    merchantPayload: { bytes: merchantBytes, orderCount: merchantOrderCount, bytesPerOrder: Number(perOrderAvg.toFixed(1)), kbPerMinutePerDashboard: Number(kbPerMinutePerDashboard.toFixed(1)) },
    customerPayload: { bytes: customerBytes, frame: customerFrame },
    queryCost: {
      getOrdersFullBoard: summarizeLatencies(getOrdersLatencies),
      storeStreamTimeToFirstFrame: summarizeLatencies(streamTtfbLatencies),
    },
    payloadGrowthCurve: growthCurve,
  };

  writeFileSync(new URL("./results/sequential-payload.json", import.meta.url), JSON.stringify(report, null, 2));
  console.log("\nWritten: scripts/loadtest/results/sequential-payload.json");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
