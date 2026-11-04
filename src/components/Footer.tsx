import Link from "next/link";
import { businessSettings } from "@/lib/config";
import { getBusinessSettings } from "@/lib/business-settings";
import { services } from "@/lib/services";

export default async function Footer() {
  // Phone comes from the owner-editable settings table when configured
  // (Phase 7b), falling back to the config constants.
  const contact = await getBusinessSettings();
  return (
    <footer className="border-t border-brand-100 bg-brand-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <p className="text-lg font-extrabold tracking-tight text-ink-900">
            Z<span className="text-brand-600">-clean</span>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            {businessSettings.tagline} Book a pickup, track your order, and get
            everything back fresh — without the laundry-day effort.
          </p>
        </div>

        <nav aria-label="Services">
          <p className="text-sm font-bold uppercase tracking-wide text-ink-900">
            Services
          </p>
          <ul className="mt-3 space-y-2 text-sm text-ink-700">
            {services.slice(0, 6).map((s) => (
              <li key={s.slug}>
                <Link href={`/services/${s.slug}`} className="hover:text-brand-700">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Company">
          <p className="text-sm font-bold uppercase tracking-wide text-ink-900">
            Z-clean
          </p>
          <ul className="mt-3 space-y-2 text-sm text-ink-700">
            <li><Link href="/about" className="hover:text-brand-700">About us</Link></li>
            <li><Link href="/process" className="hover:text-brand-700">How it works</Link></li>
            <li><Link href="/pricing" className="hover:text-brand-700">Pricing</Link></li>
            <li><Link href="/faq" className="hover:text-brand-700">FAQ</Link></li>
            <li><Link href="/dashboard" className="hover:text-brand-700">My orders</Link></li>
            <li><Link href="/privacy" className="hover:text-brand-700">Privacy policy</Link></li>
            <li><Link href="/terms" className="hover:text-brand-700">Terms of service</Link></li>
          </ul>
        </nav>

        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-ink-900">
            Get in touch
          </p>
          <ul className="mt-3 space-y-2 text-sm text-ink-700">
            {contact.hasPhone ? (
              <li>
                <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="hover:text-brand-700">
                  {contact.phone}
                </a>
              </li>
            ) : (
              <li>Contact details will be published here at launch.</li>
            )}
            <li>{businessSettings.serviceAreasNote}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-brand-100">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-ink-500 sm:px-6">
          © {new Date().getFullYear()} Z-clean. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
