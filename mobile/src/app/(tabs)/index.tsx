import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  Card,
  ErrorBlock,
  LoadingBlock,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  styles,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { loadCatalogue, type StorefrontCatalogue } from "../../lib/catalogue";
import { formatPaise } from "../../lib/format";

/**
 * Home — the service catalogue with live prices. The catalogue is
 * read from the database (services + price_items under public-read
 * RLS), exactly like the web storefront; the bundled approved list
 * is only a fallback (flagged on screen when used).
 */
export default function HomeScreen() {
  const { user } = useAuth();
  const [catalogue, setCatalogue] = useState<StorefrontCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    loadCatalogue()
      .then((c) => {
        if (mounted) setCatalogue(c);
      })
      .catch(() => {
        if (mounted) setError("Could not load the price list. Check your connection and try again.");
      });
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  return (
    <Screen>
      <Title>Laundry & dry cleaning, door to door</Title>
      <Subtitle>
        Pickup and delivery across Bokaro Steel City. Pay on delivery — prices below are the live
        rates, confirmed again on the server when you order.
      </Subtitle>

      <PrimaryButton
        label={user ? "Book a pickup" : "Sign in to book a pickup"}
        onPress={() => router.push(user ? "/(tabs)/place-order" : "/login")}
      />

      {error ? (
        <ErrorBlock message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !catalogue ? (
        <LoadingBlock label="Loading services & prices…" />
      ) : (
        <>
          {!catalogue.fromDatabase && (
            <Card>
              <Text style={styles.muted}>
                Showing the standard price list — live prices could not be loaded just now. Your
                order total is always confirmed on the server before it is placed.
              </Text>
            </Card>
          )}
          {catalogue.groups.map((group) => (
            <Card key={group.title}>
              <Text style={styles.label}>{group.title}</Text>
              <Text style={styles.muted}>{group.unitNote}</Text>
              {group.items.map((item) => (
                <View key={`${item.serviceSlug}::${item.itemName}`} style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { flex: 1, color: "#1f2937" }]}>
                    {item.itemName}
                    {item.note ? `\n${item.note}` : ""}
                  </Text>
                  <Text style={styles.totalValue}>
                    {formatPaise(Math.round(item.priceInr * 100))} {item.unitLabel}
                  </Text>
                </View>
              ))}
            </Card>
          ))}
          <Text style={styles.muted}>
            Express service (same/next day) is 1.5× the regular rate. Free pickup & delivery on
            orders of ₹299 or more; ₹40 below that. Minimum order ₹199.
          </Text>
        </>
      )}
    </Screen>
  );
}
