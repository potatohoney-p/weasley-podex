/**
 * 110 M2-done-① e2e: drive the COMPILED jwcRuntime through one real provider
 * turn, in-process (no child process, no NDJSON parse), and assert the engine's
 * AgentSessionEvents land on the podex bus via jwc-event-mapper (110.4 table).
 *
 * Opt-in only — reads real ~/.jwc/agent credentials (JWC_110_E2E=1). Never runs
 * unguarded in CI. Requires a built backend (`npm run build`) and a built jwc
 * Node bundle (`bun run build:node` in jawcode/packages/jwc).
 *
 * Wiring under test:
 *   JWC_SDK_PATH          → jwcRuntime.loadSdk() dynamic-imports dist-node/sdk.js
 *   podex_JWC_AGENT_DIR → engine auth/model discovery points at the cred store
 *
 * Usage:
 *   JWC_110_E2E=1 node scripts/jwc-110-e2e.mjs
 *   (override the bundle with JWC_SDK_PATH=/abs/path/to/dist-node/sdk.js)
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.JWC_110_E2E !== "1") {
	console.log("[110 e2e] skipped — set JWC_110_E2E=1 to run (reads real credentials)");
	process.exit(0);
}

const PODEXRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Default bundle: jawcode fork sits beside podex under 700_projects/.
const defaultBundle = path.resolve(PODEXRoot, "../jawcode/packages/jwc/dist-node/sdk.js");
const distNode = process.env.JWC_SDK_PATH?.trim() || defaultBundle;
assert.ok(existsSync(distNode), `jwc Node bundle not found: ${distNode} (run build:node, or set JWC_SDK_PATH)`);

process.env.JWC_SDK_PATH = distNode;
// No podex_JWC_AGENT_DIR override — jaw mode's default agentDir (~/.jwc/agent,
// 111 §e decision 0) must resolve the real credential store on its own.
process.env.GJC_BRAND_NAME = "jwc";
process.env.JWC_BRAND_NAME = "jwc";

const { jawRuntime } = await import(path.join(PODEXRoot, "dist/src/agent/jwc-runtime.js"));
const { addBroadcastListener } = await import(path.join(PODEXRoot, "dist/src/core/bus.js"));

const cwd = mkdtempSync(path.join(tmpdir(), "jwc-110-cwd-"));
writeFileSync(path.join(cwd, "README.md"), "# scratch\n");

const events = [];
addBroadcastListener((type, data) => events.push({ type, data }));

let result;
try {
	result = await jawRuntime.prompt(cwd, "Say hello in one short sentence.");
} finally {
	await jawRuntime.dispose();
	rmSync(cwd, { recursive: true, force: true });
}

const outputs = events.filter(e => e.type === "agent_output");
const deltaText = outputs.map(e => e.data.text ?? "").join("");
const done = events.find(e => e.type === "agent_done");
const statuses = events.filter(e => e.type === "agent_status");

console.log(`[110 e2e] result.code = ${result.code}`);
console.log(
	`[110 e2e] bus events = ${events.length} (output:${outputs.length}, status:${statuses.length}, done:${done ? 1 : 0})`,
);
console.log(`[110 e2e] cli on events = ${[...new Set(events.map(e => e.data.cli))].join(",")}`);
console.log(`[110 e2e] streamed text (snippet) = ${JSON.stringify(deltaText.slice(0, 80))}`);

assert.equal(result.code, 0, `turn failed: ${result.text}`);
assert.ok(outputs.length > 0, "no agent_output deltas reached the bus");
assert.ok(deltaText.trim().length > 0, "streamed assistant text is empty");
assert.ok(done, "no agent_done on the bus");
assert.ok(!done.data.error, `agent_done flagged error: ${done.data.text}`);
assert.ok(
	events.every(e => e.data.cli === "jwc"),
	"an event carried a non-jwc cli tag",
);
assert.ok(!jawRuntime.busy, "runtime still busy after turn settled");

console.log("[110 e2e] ✅ in-process jwc turn streamed and mapped to the bus");
process.exit(0);


