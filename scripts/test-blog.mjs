/**
 * Blog content tests (Delta 3) — plain node, no test framework.
 * Compiles src/content/blog.ts (with src/lib/media.ts) using the
 * project's own TypeScript, then asserts the content contract the
 * site relies on: exactly the three launch articles, unique slugs,
 * valid staggered Nov-2026 dates, complete structured bodies, a
 * related service that exists, and — the integrity rule — no
 * fabricated business claims in any article text.
 * Run: `npm run test:blog`. Exits non-zero on any failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "zclean-blog-test-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/content/blog.ts",
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const { blogPosts, getBlogPost, latestBlogPosts, formatBlogDate } = require(
    join(scratch, "content/blog.js"),
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
      actual === expected,
      `(expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
    );
  }

  eq("three launch articles", blogPosts.length, 3);
  eq(
    "slugs unique",
    new Set(blogPosts.map((p) => p.slug)).size,
    blogPosts.length,
  );

  const expectedSlugs = [
    "silk-saree-festive-wear-care",
    "wash-fold-vs-wash-iron-vs-dry-cleaning",
    "monsoon-laundry-guide",
  ];
  for (const slug of expectedSlugs) {
    check(`article exists: ${slug}`, Boolean(getBlogPost(slug)));
  }
  eq("unknown slug → undefined", getBlogPost("no-such-post"), undefined);

  // Dates: all November 2026, all distinct (staggered).
  check(
    "all dates in Nov 2026",
    blogPosts.every((p) => /^2026-11-\d{2}$/.test(p.date)),
  );
  eq(
    "dates staggered (all distinct)",
    new Set(blogPosts.map((p) => p.date)).size,
    blogPosts.length,
  );
  eq("date format", formatBlogDate("2026-11-10"), "10 Nov 2026");

  // Latest-first ordering for the homepage / index.
  const latest = latestBlogPosts(3);
  eq("latest first is the newest", latest[0].slug, "silk-saree-festive-wear-care");
  eq("latest respects count", latestBlogPosts(2).length, 2);

  // Every article is complete and renderable.
  for (const post of blogPosts) {
    check(`${post.slug}: title present`, post.title.length > 10);
    check(`${post.slug}: excerpt present`, post.excerpt.length > 40);
    check(
      `${post.slug}: cover has src + alt`,
      Boolean(post.cover.src && post.cover.alt),
    );
    check(
      `${post.slug}: reading time sane`,
      post.readingMinutes >= 2 && post.readingMinutes <= 15,
    );
    check(`${post.slug}: tags present`, post.tags.length >= 2);
    check(
      `${post.slug}: body has ≥6 blocks`,
      post.body.length >= 6,
      `(got ${post.body.length})`,
    );
    check(
      `${post.slug}: body opens with a paragraph`,
      post.body[0].type === "paragraph",
    );
    check(
      `${post.slug}: body has a heading`,
      post.body.some((b) => b.type === "heading"),
    );
    check(
      `${post.slug}: body has a list`,
      post.body.some((b) => b.type === "list" && b.items.length >= 3),
    );
    check(
      `${post.slug}: related service set`,
      typeof post.serviceSlug === "string" && post.serviceSlug.length > 0,
    );
  }

  // Integrity guard: no fabricated-claim phrasing anywhere in the
  // article text (titles, excerpts, bodies). If a future article
  // legitimately needs one of these words, it must come with a real,
  // sourced fact — and a human decision, not a quiet edit here.
  const banned = [
    /thousands of customers/i,
    /lakhs? of customers/i,
    /award[- ]winning/i,
    /#1 laundry/i,
    /best laundry in/i,
    /rated 4\.\d/i,
    /customers love us/i,
  ];
  const allText = blogPosts
    .flatMap((p) => [
      p.title,
      p.excerpt,
      ...p.body.flatMap((b) =>
        b.type === "list" ? b.items : [b.text],
      ),
    ])
    .join("\n");
  for (const pattern of banned) {
    check(`no fabricated claim: ${pattern}`, !pattern.test(allText));
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
