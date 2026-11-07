import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import { businessSettings } from "@/lib/config";
import { getBusinessSettings } from "@/lib/business-settings";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Questions about a Sri Clean service, a booking, or special-care items? Send us a message or call us.",
};

/**
 * Contact page (server wrapper). The phone number is read through
 * getBusinessSettings() — settings table first, config fallback — so an
 * edit at /admin/settings shows here immediately (Phase 7b).
 */
export default async function ContactPage() {
  const contact = await getBusinessSettings();

  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
        Contact us
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-500">
        Questions about a service, a booking, or an item that needs special
        care? Send us a message and we will reply by email.
      </p>

      <ContactForm
        phone={contact.phone}
        hasPhone={contact.hasPhone}
        serviceAreasNote={businessSettings.serviceAreasNote}
      />
    </section>
  );
}
