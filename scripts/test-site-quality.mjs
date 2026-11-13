/**
 * Site-quality pass guards (Nov 2026 checklist): custom 404, per-page
 * titles/descriptions, no-horizontal-scroll guard, clickable business
 * contact details, an honest contact form, and compressed brand images.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");
let n = 0;
const ok = (cond, label) => {
  n += 1;
  if (!cond) throw new Error(`site-quality: ${label}`);
};

// 1. Custom branded 404.
const nf = read("src/app/not-found.tsx");
ok(nf.includes('title: "Page not found"'), "404 carries its own title");
ok(nf.includes("/logo.png"), "404 shows the brand logo");
for (const href of ['href="/"', 'href="/services"', 'href="/dashboard"']) {
  ok(nf.includes(href), `404 links ${href}`);
}

// 2. Client pages get titles + descriptions from sibling layouts.
for (const route of ["login", "register", "forgot-password", "reset-password", "schedule-pickup"]) {
  const layout = read(`src/app/${route}/layout.tsx`);
  ok(layout.includes("title:") && layout.includes("description:"), `${route} layout has title + description`);
}
const orderLayout = read("src/app/orders/[id]/layout.tsx");
ok(orderLayout.includes('title: "Order details"'), "order details layout title");
ok(read("src/app/dashboard/page.tsx").includes("description:"), "dashboard metadata description");
ok(read("src/app/orders/[id]/receipt/page.tsx").includes("description:"), "receipt metadata description");
ok(read("src/app/staff/(app)/layout.tsx").includes('title: "Staff app"'), "staff layout title");

// 3. No-horizontal-scroll guard (clip keeps sticky headers working).
const css = read("src/app/globals.css");
ok((css.match(/overflow-x: clip/g) ?? []).length >= 2, "overflow-x: clip on html and body");

// 4. Business contact details are clickable wherever they render.
const receipt = read("src/components/Receipt.tsx");
ok(receipt.includes("mailto:${business.email}"), "receipt email is a mailto link");
ok(receipt.includes("tel:${business.phone"), "receipt phone is a tel link");
ok(read("src/components/Header.tsx").includes("tel:"), "header phone is a tel link");
ok(read("src/components/Footer.tsx").includes("tel:"), "footer phone is a tel link");

// 5. Contact form honesty: no undeliverable promise; note kept on-device.
const form = read("src/components/ContactForm.tsx");
ok(!form.includes("will reply"), "contact form makes no false reply promise");
ok(form.includes("can&rsquo;t deliver your message just yet"), "contact form states the inbox opens at launch");
ok(form.includes("sriclean:contact-enquiries"), "contact enquiry is kept on the visitor's device");

// 6. Brand images stay compressed.
ok(statSync(join(root, "public/logo.png")).size < 100_000, "logo.png under 100 KB");
ok(statSync(join(root, "public/logo-stacked.png")).size < 60_000, "logo-stacked.png under 60 KB");
ok(statSync(join(root, "public/icons/icon-512.png")).size < 40_000, "icon-512.png under 40 KB");

console.log(`site-quality: ${n} assertions passed`);
