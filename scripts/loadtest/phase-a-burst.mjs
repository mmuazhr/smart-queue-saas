// Phase A — order-creation burst load.
// At each concurrency level, runs a discarded warm-up burst then N measured
// trials of N concurrent POST /api/orders (split across both seeded stores).
// Errors are intermittent at the Next.js/Prisma-adapter layer (see RESULTS.md
// "Finding" section) — reporting per-trial pass/fail plus an aggregate error
// rate is more honest than a single pass/fail per level.
//
// Usage: node scripts/loadtest/phase-a-burst.mjs [--levels=50,100,200,400] [--trials=5] [--label=run] [--port=3100]

import {
  loadFixture,
  summarizeLatencies,
  findServerPid,
  startRssSampler,
  rssSummary,
  httpPostJson,
  classify,
  resetPeakInFlight,
  getPeakInFlight,
} from "./lib/common.mjs";
import { writeFileSync, mkdirSync } from "fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);
const levels = (args.levels ?? "50,100,200,400").split(",").map(Number);
const trialsPerLevel = Number(args.trials ?? 5);
const label = args.label ?? "run";
const port = Number(args.port ?? 3100);

const fixture = loadFixture();
const storeIds = fixture.stores.map((s) => s.id);
const menuItemIds = storeIds.map((id) => fixture.menuItemIds[id]);

let orderCounter = 0;

async function fireOrder(storeIdx) {
  const storeId = storeIds[storeIdx];
  const items = menuItemIds[storeIdx];
  const menuItemId = items[orderCounter % items.length];
  orderCounter++;

  const result = await httpPostJson(port, "/api/orders", {
    storeId,
    customerPhone: "+6012" + String(1000000 + Math.floor(Math.random() * 8999999)),
    customerName: "Burst Customer",
    items: [{ menuItemId, quantity: 1 + (orderCounter % 3) }],
  });
  return { ...result, bucket: classify(result) };
}

async function runBurst(concurrency) {
  resetPeakInFlight();
  const wallStart = performance.now();
  const results = await Promise.all(
    Array.from({ length: concurrency }, (_, i) => fireOrder(i % storeIds.length))
  );
  const wallElapsed = (performance.now() - wallStart) / 1000;
  return { results, wallElapsed, peakInFlight: getPeakInFlight() };
}

async function runLevel(concurrency, pid) {
  // Discarded warm-up burst: absorbs pool-cold-start noise so measured
  // trials reflect steady-state behaviour, not connection establishment.
  await runBurst(Math.min(concurrency, 20));
  await new Promise((r) => setTimeout(r, 500));

  const sampler = pid ? startRssSampler(pid, 250) : null;
  const trials = [];
  for (let t = 0; t < trialsPerLevel; t++) {
    const { results, wallElapsed, peakInFlight } = await runBurst(concurrency);
    const byBucket = { ok: 0, app: 0, client: 0 };
    const byStatus = {};
    for (const r of results) {
      byBucket[r.bucket]++;
      const key = r.status || r.err;
      byStatus[key] = (byStatus[key] ?? 0) + 1;
    }
    const okLatencies = results.filter((r) => r.bucket === "ok").map((r) => r.elapsed);
    trials.push({
      trial: t + 1,
      wallSeconds: Number(wallElapsed.toFixed(3)),
      peakInFlight,
      byBucket,
      byStatus,
      latencyMsOkOnly: summarizeLatencies(okLatencies),
      throughputPerSec: Number((byBucket.ok / wallElapsed).toFixed(2)),
    });
    await new Promise((r) => setTimeout(r, 300));
  }
  const rssSamples = sampler ? sampler.stop() : [];

  const totalRequests = trials.reduce((s, t) => s + t.byBucket.ok + t.byBucket.app + t.byBucket.client, 0);
  const totalOk = trials.reduce((s, t) => s + t.byBucket.ok, 0);
  const totalApp = trials.reduce((s, t) => s + t.byBucket.app, 0);
  const totalClient = trials.reduce((s, t) => s + t.byBucket.client, 0);
  const cleanTrials = trials.filter((t) => t.byBucket.app === 0 && t.byBucket.client === 0).length;

  return {
    concurrency,
    trialsPerLevel,
    cleanTrials,
    totalRequests,
    totalOk,
    totalApp,
    totalClient,
    errorRatePct: Number(((totalApp + totalClient) / totalRequests * 100).toFixed(2)),
    trials,
    rss: rssSummary(rssSamples),
  };
}

async function main() {
  const pid = findServerPid(port);
  console.log(`Phase A [${label}] — server PID on :${port} = ${pid ?? "not found"}`);
  console.log(`Levels: ${levels.join(", ")}, trials/level: ${trialsPerLevel}`);

  const levelResults = [];
  for (const c of levels) {
    console.log(`\n-- concurrency ${c} --`);
    const r = await runLevel(c, pid);
    console.log(
      `  clean trials: ${r.cleanTrials}/${r.trialsPerLevel} | error rate: ${r.errorRatePct}% | ok: ${r.totalOk}/${r.totalRequests}`
    );
    console.log(`  peak in-flight (trial 1): ${r.trials[0].peakInFlight}`);
    console.log(`  latency (ok only, trial 1): ${JSON.stringify(r.trials[0].latencyMsOkOnly)}`);
    console.log(`  RSS: ${JSON.stringify(r.rss)}`);
    levelResults.push(r);
    await new Promise((res) => setTimeout(res, 1500));
  }

  mkdirSync(new URL("./results", import.meta.url), { recursive: true });
  const outPath = new URL(`./results/phase-a-${label}.json`, import.meta.url);
  writeFileSync(outPath, JSON.stringify({ label, port, pid, levels: levelResults }, null, 2));
  console.log(`\nWritten: ${outPath.pathname}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
