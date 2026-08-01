// Phase D — find the actual SSE breaking point.
// Ramps SSE connection count (default 300, 500, 1000, 1500) until something
// fails, holding each level briefly. Reports ulimit -n and separates
// client-side failures (EMFILE/ECONNRESET on this test machine) from
// server-side failures (refused/dropped/error responses).
//
// Usage: node scripts/loadtest/phase-d-breaking-point.mjs [--levels=300,500,1000,1500] [--hold=15000] [--port=3100] [--label=run]

import { execSync } from "child_process";
import { loadFixture, findServerPid, startRssCpuSampler, rssCpuSummary, openSseConnection } from "./lib/common.mjs";
import { writeFileSync, mkdirSync } from "fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);
const levels = (args.levels ?? "300,500,1000,1500").split(",").map(Number);
const holdMs = Number(args.hold ?? 15000);
const port = Number(args.port ?? 3100);
const label = args.label ?? "run";

const fixture = loadFixture();
const customerOrderIds = fixture.stores.flatMap((s) => fixture.orderIds[s.id]);

function getUlimit() {
  try {
    return execSync("ulimit -n", { shell: "/bin/bash" }).toString().trim();
  } catch {
    return "unknown";
  }
}

async function runLevel(n, pid) {
  const sampler = pid ? startRssCpuSampler(pid, 1000) : null;
  const wallStart = performance.now();

  const results = await Promise.all(
    Array.from({ length: n }, (_, i) =>
      openSseConnection(port, `/api/queue/stream?orderId=${customerOrderIds[i % customerOrderIds.length]}`, {}, holdMs)
    )
  );

  const wallSeconds = (performance.now() - wallStart) / 1000;
  const rssCpuSamples = sampler ? sampler.stop() : [];

  const opened = results.filter((r) => r.opened);
  // client-side failures: never got a response at all (connection refused,
  // reset, or our own timeout firing before headers arrived)
  const clientFailed = results.filter((r) => !r.opened && (r.kind === "client" || r.status === 0));
  // server-side failures: got a real non-200 response
  const serverFailed = results.filter((r) => !r.opened && r.status && r.status !== 200);
  const droppedEarly = opened.filter((r) => r.heldMs < holdMs * 0.9);

  const errorMessages = {};
  for (const r of [...clientFailed, ...serverFailed]) {
    const key = r.errorMsg ?? `status:${r.status}`;
    errorMessages[key] = (errorMessages[key] ?? 0) + 1;
  }

  return {
    n,
    wallSeconds: Number(wallSeconds.toFixed(1)),
    opened: opened.length,
    clientFailed: clientFailed.length,
    serverFailed: serverFailed.length,
    droppedEarly: droppedEarly.length,
    errorMessages,
    serverProcess: rssCpuSummary(rssCpuSamples),
  };
}

async function main() {
  const pid = findServerPid(port);
  const ulimitN = getUlimit();
  console.log(`Phase D [${label}] — server PID on :${port} = ${pid ?? "not found"}`);
  console.log(`Client ulimit -n: ${ulimitN}`);
  console.log(`Levels: ${levels.join(", ")}, hold ${holdMs}ms each`);

  const levelResults = [];
  let stoppedAt = null;
  for (const n of levels) {
    console.log(`\n-- ${n} SSE connections --`);
    const r = await runLevel(n, pid);
    console.log(JSON.stringify(r, null, 2));
    levelResults.push(r);
    const failureRate = (r.clientFailed + r.serverFailed + r.droppedEarly) / r.n;
    if (failureRate > 0.05 && !stoppedAt) {
      stoppedAt = n;
      console.log(`\n>5% failure rate reached at n=${n} — this is the observed breaking point.`);
    }
    await new Promise((res) => setTimeout(res, 2000));
  }

  const report = { label, port, pid, ulimitN, holdMs, levels: levelResults, breakingPoint: stoppedAt };
  mkdirSync(new URL("./results", import.meta.url), { recursive: true });
  const outPath = new URL(`./results/phase-d-${label}.json`, import.meta.url);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWritten: ${outPath.pathname}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
