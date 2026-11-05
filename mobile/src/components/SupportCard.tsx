import * as Linking from "expo-linking";
import { Text } from "react-native";
import { Card, GhostButton, styles } from "./ui";
import { BUSINESS } from "../lib/config";

/**
 * Help & Support (Delta 2) — call, WhatsApp, email and FAQs, from
 * the account tab and from an order's tracking screen. Contact
 * points come from BUSINESS (src/lib/config.ts), the mobile mirror
 * of the web's business settings; the email action is hidden while
 * no business email is configured — the web's own convention of
 * never inventing contact details.
 *
 * From an order, `orderRef` (the short customer-facing reference)
 * pre-fills the WhatsApp / email text so support sees which order
 * the customer means without them typing anything.
 */
export default function SupportCard({ orderRef }: { orderRef?: string }) {
  const subject = orderRef ? `Help with order ${orderRef}` : "Z-clean support";
  const message = orderRef
    ? `Hi Z-clean, I need help with my order ${orderRef}.`
    : "Hi Z-clean, I need help with my laundry order.";

  return (
    <Card>
      <Text style={styles.label}>Help &amp; Support</Text>
      <Text style={styles.muted}>
        Questions about a pickup, an item, or a payment? Reach us whichever way
        is easiest — we reply during working hours.
      </Text>
      <GhostButton
        label={`Call us · ${BUSINESS.phoneDisplay}`}
        onPress={() => void Linking.openURL(`tel:${BUSINESS.phoneTel}`)}
      />
      <GhostButton
        label="Chat on WhatsApp"
        onPress={() =>
          void Linking.openURL(
            `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(message)}`,
          )
        }
      />
      {BUSINESS.email ? (
        <GhostButton
          label={`Email · ${BUSINESS.email}`}
          onPress={() =>
            void Linking.openURL(
              `mailto:${BUSINESS.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
            )
          }
        />
      ) : null}
      <GhostButton
        label="Read the FAQs"
        onPress={() => void Linking.openURL(BUSINESS.faqUrl)}
      />
    </Card>
  );
}
