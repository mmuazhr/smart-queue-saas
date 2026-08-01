// Shared helpers for the loadtest scripts. Plain Node (fetch, ps), no extra deps.

import http from "http";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execFileSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Node's global fetch (undici) caps at ~6 connections per origin by default,
// which silently serializes any "concurrent" burst built on fetch. Use a
// plain http.Agent with a high maxSockets instead so the concurrency labels
// in the reports are the real number of in-flight requests, not ~6.
export const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 8000 });

let inFlight = 0;
let peakInFlight = 0;
export function resetPeakInFlight() {
  peakInFlight = 0;
}
export function getPeakInFlight() {
  return peakInFlight;
}

/**
 * POST JSON over plain node:http with a bounded timeout and a resolve-never-
 * reject contract, so one stuck socket can never hang a Promise.all batch.
 */
export function httpPostJson(port, path, bodyObj, timeoutMs = 15000) {
  inFlight++;
  peakInFlight = Math.max(peakInFlight, inFlight);
  const body = JSON.stringify(bodyObj);
  const start = performance.now();
  return new Promise((resolve) => {
    const done = (result) => {
      inFlight--;
      resolve({ ...result, elapsed: performance.now() - start });
    };
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path,
        method: "POST",
        agent: httpAgent,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => done({ status: res.statusCode, body: data, kind: "response" }));
        res.on("error", (e) => done({ status: 0, err: e.message, kind: "client" }));
      }
    );
    req.on("timeout", () => {
      req.destroy();
      done({ status: 0, err: "TIMEOUT", kind: "client" });
    });
    req.on("error", (e) => done({ status: 0, err: e.message, kind: "client" }));
    req.write(body);
    req.end();
  });
}

/** GET over plain node:http, same resolve-never-reject / timeout contract. */
export function httpGet(port, path, headers = {}, timeoutMs = 15000) {
  inFlight++;
  peakInFlight = Math.max(peakInFlight, inFlight);
  const start = performance.now();
  return new Promise((resolve) => {
    const done = (result) => {
      inFlight--;
      resolve({ ...result, elapsed: performance.now() - start });
    };
    const req = http.request(
      { hostname: "localhost", port, path, method: "GET", agent: httpAgent, headers, timeout: timeoutMs },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => done({ status: res.statusCode, body: data, kind: "response" }));
        res.on("error", (e) => done({ status: 0, err: e.message, kind: "client" }));
      }
    );
    req.on("timeout", () => {
      req.destroy();
      done({ status: 0, err: "TIMEOUT", kind: "client" });
    });
    req.on("error", (e) => done({ status: 0, err: e.message, kind: "client" }));
    req.end();
  });
}

/** Classify a settled request into app (4xx/5xx) vs client (timeout/socket) error buckets. */
export function classify(result) {
  if (result.kind === "client") return "client";
  if (result.status >= 200 && result.status < 300) return "ok";
  return "app";
}

export function loadFixture() {
  return JSON.parse(readFileSync(join(__dirname, "..", "fixture.json"), "utf8"));
}

export const BASE_URL = process.env.LOADTEST_BASE_URL ?? "http://localhost:3100";

export function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return NaN;
  const idx = Math.min(sortedValues.length - 1, Math.ceil((p / 100) * sortedValues.length) - 1);
  return sortedValues[Math.max(0, idx)];
}

export function summarizeLatencies(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? null,
  };
}

/** Find the PID of the `next start` server listening on a given port (macOS lsof). */
export function findServerPid(port) {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    });
    const lines = out.trim().split("\n").slice(1);
    if (lines.length === 0) return null;
    const parts = lines[0].trim().split(/\s+/);
    return Number(parts[1]);
  } catch {
    return null;
  }
}

/** Sample RSS (KB) of a PID at a fixed interval until stop() is called. */
export function startRssSampler(pid, intervalMs = 500) {
  const samples = [];
  const timer = setInterval(() => {
    try {
      const out = execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" });
      const rssKb = Number(out.trim());
      if (Number.isFinite(rssKb)) samples.push({ t: Date.now(), rssKb });
    } catch {
      // process may have exited; stop silently, caller reads samples collected so far
    }
  }, intervalMs);
  return {
    stop() {
      clearInterval(timer);
      return samples;
    },
  };
}

/** Sample RSS (MB) + %CPU of a PID at a fixed interval until stop() is called. */
export function startRssCpuSampler(pid, intervalMs = 1000) {
  const samples = [];
  const timer = setInterval(() => {
    try {
      const out = execFileSync("ps", ["-o", "rss=,%cpu=", "-p", String(pid)], { encoding: "utf8" });
      const [rssKb, cpuPct] = out.trim().split(/\s+/).map(Number);
      if (Number.isFinite(rssKb)) samples.push({ t: Date.now(), rssMb: rssKb / 1024, cpuPct });
    } catch {
      // process may have exited
    }
  }, intervalMs);
  return {
    stop() {
      clearInterval(timer);
      return samples;
    },
  };
}

export function rssCpuSummary(samples) {
  if (samples.length === 0) return { minRssMb: null, maxRssMb: null, avgCpuPct: null, maxCpuPct: null, count: 0 };
  const rss = samples.map((s) => s.rssMb);
  const cpu = samples.map((s) => s.cpuPct).filter((c) => Number.isFinite(c));
  return {
    minRssMb: Number(Math.min(...rss).toFixed(1)),
    maxRssMb: Number(Math.max(...rss).toFixed(1)),
    avgCpuPct: cpu.length ? Number((cpu.reduce((a, b) => a + b, 0) / cpu.length).toFixed(1)) : null,
    maxCpuPct: cpu.length ? Number(Math.max(...cpu).toFixed(1)) : null,
    count: samples.length,
  };
}

/**
 * Open one SSE connection over plain node:http. Resolves once the response
 * finishes, errors, or `holdMs` elapses (whichever first) — never rejects.
 * Reports whether it opened (got headers), how many bytes/events streamed,
 * and the first raw `data:` frame (for payload-size measurement).
 */
export function openSseConnection(port, path, headers, holdMs) {
  return new Promise((resolve) => {
    let opened = false;
    let bytes = 0;
    let eventCount = 0;
    let firstFrame = null;
    let closedEarly = false;
    let errorMsg = null;
    let buf = "";
    const start = performance.now();

    const req = http.request(
      { hostname: "localhost", port, path, method: "GET", agent: httpAgent, headers, timeout: holdMs + 5000 },
      (res) => {
        opened = res.statusCode === 200;
        if (!opened) {
          let errBody = "";
          res.on("data", (c) => (errBody += c));
          res.on("end", () =>
            finish({ opened, status: res.statusCode, bytes: 0, eventCount: 0, firstFrame: errBody.slice(0, 300) })
          );
          return;
        }
        res.on("data", (chunk) => {
          bytes += chunk.length;
          buf += chunk.toString("utf8");
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const f of frames) {
            if (f.startsWith("data:")) {
              eventCount++;
              if (!firstFrame) firstFrame = f.slice(5).trim();
            }
          }
        });
        res.on("end", () => {
          finish({ opened, status: res.statusCode, bytes, eventCount, firstFrame });
        });
        res.on("error", (e) => {
          errorMsg = e.message;
          finish({ opened, status: res.statusCode, bytes, eventCount, firstFrame, errorMsg });
        });
      }
    );
    req.on("timeout", () => {
      // Expected: we hold the connection open on purpose, then time out our
      // own read at holdMs+5s as a safety net if the server never closes it.
      req.destroy();
      finish({ opened, status: opened ? 200 : 0, bytes, eventCount, firstFrame, closedEarly: false });
    });
    req.on("error", (e) => {
      finish({ opened: false, status: 0, bytes, eventCount, firstFrame, errorMsg: e.message, kind: "client" });
    });
    req.end();

    // Deliberately close from our side after holdMs to bound the test duration.
    const holdTimer = setTimeout(() => {
      req.destroy();
    }, holdMs);

    let finished = false;
    function finish(result) {
      if (finished) return;
      finished = true;
      clearTimeout(holdTimer);
      resolve({ ...result, heldMs: performance.now() - start });
    }
  });
}

export function rssSummary(samples) {
  if (samples.length === 0) return { minMb: null, maxMb: null, endMb: null, count: 0 };
  const mb = samples.map((s) => s.rssKb / 1024);
  return {
    minMb: Math.min(...mb).toFixed(1),
    maxMb: Math.max(...mb).toFixed(1),
    endMb: mb[mb.length - 1].toFixed(1),
    count: samples.length,
  };
}

/** Log in via the NextAuth credentials flow; returns a `Cookie:` header value. */
export async function loginMerchant(baseUrl, email, password) {
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`);
  const csrfCookies = extractSetCookies(csrfRes);
  const { csrfToken } = await csrfRes.json();

  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${baseUrl}/dashboard`,
    json: "true",
  });

  const loginRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(csrfCookies),
    },
    body: body.toString(),
    redirect: "manual",
  });

  const loginCookies = extractSetCookies(loginRes);
  const merged = { ...csrfCookies, ...loginCookies };
  if (!merged["authjs.session-token"]) {
    throw new Error(`Login failed for ${email}: no session token in response`);
  }
  return cookieHeader(merged);
}

function extractSetCookies(res) {
  const jar = {};
  // Node's fetch Headers exposes getSetCookie() (Node 18.16+/20+).
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}
