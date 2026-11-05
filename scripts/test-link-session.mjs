/**
 * Link-session tests — plain node, no test framework. Compiles
 * src/lib/link-session.ts (a pure, import-free module) with the
 * project's own TypeScript into a scratch dir inside the project,
 * then asserts the emailed-link session decision:
 *   1. an existing session → show the form ("ready"),
 *   2. implicit-flow tokens in the URL fragment → "set-session"
 *      (the PKCE browser client refuses these itself — the
 *      2026-11-05 staff-invite bug),
 *   3. an error fragment → "invalid", directly (even over an
 *      existing session),
 *   4. nothing usable → "invalid".
 * Run: `npm run test:link-session`. Exits non-zero on failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(projectRoot, ".test-scratch-link-session-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/link-session.ts",
      "--module", "commonjs",
      "--target", "es2022",
      "--lib", "es2022,dom",
      "--moduleResolution", "node",
      "--esModuleInterop",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const { parseLinkHash, resolveLinkSession } = require(
    join(scratch, "link-session.js"),
  );

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
    check(
      name,
      JSON.stringify(actual) === JSON.stringify(expected),
      `(got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`,
    );
  }

  const TOKENS =
    "#access_token=AT123&refresh_token=RT456&expires_in=3600&token_type=bearer&type=invite";

  // 1. Existing session → form, whatever the fragment holds.
  eq(
    "session + empty hash → ready",
    resolveLinkSession({ hasSession: true, hash: "" }),
    { kind: "ready" },
  );
  eq(
    "session + token hash → ready (session wins over set-session)",
    resolveLinkSession({ hasSession: true, hash: TOKENS }),
    { kind: "ready" },
  );

  // 2. Fragment tokens → set-session, values passed through decoded.
  eq(
    "no session + invite tokens → set-session",
    resolveLinkSession({ hasSession: false, hash: TOKENS }),
    { kind: "set-session", accessToken: "AT123", refreshToken: "RT456" },
  );
  eq(
    "tokens without leading # still parse",
    resolveLinkSession({
      hasSession: false,
      hash: "access_token=A%2BB&refresh_token=R%3D",
    }),
    { kind: "set-session", accessToken: "A+B", refreshToken: "R=" },
  );
  eq(
    "recovery-type tokens → set-session",
    resolveLinkSession({
      hasSession: false,
      hash: "#access_token=X&refresh_token=Y&type=recovery",
    }),
    { kind: "set-session", accessToken: "X", refreshToken: "Y" },
  );

  // 3. Error fragment → invalid, directly — even with a session.
  eq(
    "otp_expired fragment → invalid/error",
    resolveLinkSession({
      hasSession: false,
      hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    }),
    { kind: "invalid", reason: "error" },
  );
  eq(
    "error fragment beats an existing session",
    resolveLinkSession({ hasSession: true, hash: "#error_code=otp_expired" }),
    { kind: "invalid", reason: "error" },
  );
  eq(
    "error fragment beats tokens",
    resolveLinkSession({
      hasSession: false,
      hash: "#error=server_error&access_token=AT123&refresh_token=RT456",
    }),
    { kind: "invalid", reason: "error" },
  );

  // 4. Nothing usable → invalid.
  eq(
    "no session + empty hash → invalid/no-session",
    resolveLinkSession({ hasSession: false, hash: "" }),
    { kind: "invalid", reason: "no-session" },
  );
  eq(
    "no session + bare # → invalid/no-session",
    resolveLinkSession({ hasSession: false, hash: "#" }),
    { kind: "invalid", reason: "no-session" },
  );
  eq(
    "access_token without refresh_token → invalid/no-session",
    resolveLinkSession({ hasSession: false, hash: "#access_token=AT123" }),
    { kind: "invalid", reason: "no-session" },
  );
  eq(
    "refresh_token without access_token → invalid/no-session",
    resolveLinkSession({ hasSession: false, hash: "#refresh_token=RT456" }),
    { kind: "invalid", reason: "no-session" },
  );
  eq(
    "unrelated fragment params → invalid/no-session",
    resolveLinkSession({ hasSession: false, hash: "#type=invite" }),
    { kind: "invalid", reason: "no-session" },
  );

  // parseLinkHash shape.
  eq(
    "parse: tokens extracted, no error",
    parseLinkHash(TOKENS),
    {
      tokens: { accessToken: "AT123", refreshToken: "RT456" },
      hasError: false,
    },
  );
  eq(
    "parse: empty hash",
    parseLinkHash(""),
    { tokens: null, hasError: false },
  );
  eq(
    "parse: error only",
    parseLinkHash("#error_code=otp_expired"),
    { tokens: null, hasError: true },
  );

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing: ${failures.join("; ")}`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
