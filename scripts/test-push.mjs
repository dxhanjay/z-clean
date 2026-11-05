/**
 * Push notification helper tests (Delta 2) — plain node, no test
 * framework. Compiles src/lib/push.ts with the project's own
 * TypeScript into a scratch dir, then asserts the pure logic the
 * pipeline relies on: Expo token validation, 100-message chunking,
 * message building, the DeviceNotRegistered pruning decision, and
 * the status-change copy/deep-link payload.
 * The network send (sendPushToUser) is exercised live, not here.
 * Run: `npm run test:push`. Exits non-zero on any failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "zclean-push-test-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/push.ts",
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const {
    isExpoPushToken,
    chunkArray,
    buildPushMessages,
    tokensToPrune,
    statusChangePush,
    PUSH_CHUNK_SIZE,
  } = require(join(scratch, "push.js"));

  let passed = 0;
  const failures = [];
  function check(name, condition, detail = "") {
    if (condition) {
      passed += 1;
      console.log(`  PASS ${name}`);
    } else {
      failures.push(name);
      console.log(`  FAIL ${name} ${detail}`);
    }
  }
  function eq(name, actual, expected) {
    check(name, JSON.stringify(actual) === JSON.stringify(expected),
      `(expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }

  // 1 · isExpoPushToken: both Expo spellings pass; everything else fails.
  eq("token: ExponentPushToken valid", isExpoPushToken("ExponentPushToken[abcDEF123_-]"), true);
  eq("token: ExpoPushToken valid", isExpoPushToken("ExpoPushToken[xyz_9-ABC]"), true);
  eq("token: empty string", isExpoPushToken(""), false);
  eq("token: bare id without wrapper", isExpoPushToken("abcDEF123"), false);
  eq("token: missing closing bracket", isExpoPushToken("ExponentPushToken[abc"), false);
  eq("token: empty brackets", isExpoPushToken("ExponentPushToken[]"), false);
  eq("token: raw APNs hex", isExpoPushToken("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"), false);
  eq("token: null", isExpoPushToken(null), false);
  eq("token: undefined", isExpoPushToken(undefined), false);
  eq("token: number", isExpoPushToken(42), false);
  eq("token: object", isExpoPushToken({ token: "x" }), false);
  eq("token: surrounding whitespace rejected", isExpoPushToken(" ExponentPushToken[abc] "), false);

  // 2 · chunkArray: Expo's 100-message request cap and edge cases.
  eq("chunk size constant is 100", PUSH_CHUNK_SIZE, 100);
  eq("chunk: empty input", chunkArray([], 100), []);
  eq("chunk: single partial", chunkArray([1, 2, 3], 100), [[1, 2, 3]]);
  eq("chunk: exact multiple", chunkArray([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
  {
    const big = Array.from({ length: 250 }, (_, i) => i);
    const chunks = chunkArray(big, 100);
    eq("chunk: 250 at 100 → sizes", chunks.map((c) => c.length), [100, 100, 50]);
    eq("chunk: order preserved", chunks.flat(), big);
  }
  eq("chunk: size 0 guarded to 1", chunkArray([1, 2], 0), [[1], [2]]);

  // 3 · buildPushMessages: one well-formed message per token.
  {
    const payload = { title: "Picked up", body: "With our rider.", data: { orderId: "o1" } };
    const msgs = buildPushMessages(["ExponentPushToken[a]", "ExponentPushToken[b]"], payload);
    eq("messages: one per token", msgs.length, 2);
    eq("messages: recipient order", msgs.map((m) => m.to), ["ExponentPushToken[a]", "ExponentPushToken[b]"]);
    check("messages: shape", msgs.every(
      (m) => m.title === "Picked up" && m.body === "With our rider." &&
        m.sound === "default" && m.priority === "high",
    ));
    eq("messages: data passed through", msgs[0].data, { orderId: "o1" });
    eq("messages: data defaults to {}", buildPushMessages(["ExponentPushToken[a]"], { title: "t", body: "b" })[0].data, {});
    eq("messages: no tokens → no messages", buildPushMessages([], payload), []);
  }

  // 4 · tokensToPrune: ONLY DeviceNotRegistered tickets prune, by index.
  {
    const tokens = ["ExponentPushToken[a]", "ExponentPushToken[b]", "ExponentPushToken[c]", "ExponentPushToken[d]"];
    const tickets = [
      { status: "ok", id: "t1" },
      { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      { status: "error", message: "too big", details: { error: "MessageTooBig" } },
      { status: "error", message: "bad creds", details: { error: "InvalidCredentials" } },
    ];
    eq("prune: only DeviceNotRegistered", tokensToPrune(tokens, tickets), ["ExponentPushToken[b]"]);
    eq("prune: all ok → none", tokensToPrune(tokens, tickets.map(() => ({ status: "ok" }))), []);
    eq("prune: error without details → none", tokensToPrune(tokens, [{ status: "error", message: "x" }]), []);
    eq("prune: no tickets → none", tokensToPrune(tokens, []), []);
    eq("prune: no tokens → none", tokensToPrune([], tickets), []);
  }

  // 5 · statusChangePush: timeline copy + deep-link data.
  {
    const picked = statusChangePush("order-9", "PICKED_UP");
    eq("copy: step title", picked.title, "Picked up");
    eq("copy: step body is the timeline hint", picked.body, "Your laundry is with our rider.");
    eq("copy: deep-link data", picked.data, { orderId: "order-9", url: "/orders/order-9" });

    const cancelled = statusChangePush("order-9", "CANCELLED");
    check("copy: cancelled title", cancelled.title === "Order cancelled");
    check("copy: cancelled body mentions cancellation", /cancelled/i.test(cancelled.body));

    const unknown = statusChangePush("order-9", "SOMETHING_ELSE");
    eq("copy: unknown status falls back", unknown.title, "Order update");

    const cod = statusChangePush("order-9", "DELIVERED", { codCollected: true });
    check("copy: COD note appended", /Payment collected/.test(cod.body), cod.body);
    const noCod = statusChangePush("order-9", "DELIVERED");
    check("copy: no COD note by default", !/Payment collected/.test(noCod.body));
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing: ${failures.join("; ")}`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
