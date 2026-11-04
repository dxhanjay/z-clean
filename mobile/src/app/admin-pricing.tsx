import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Field, ToggleRow } from "../components/forms";
import {
  Card,
  ErrorBlock,
  LoadingBlock,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  styles,
} from "../components/ui";
import { ApiError, fetchPricing, patchPricing } from "../lib/api";
import { formatPaise } from "../lib/format";
import type { PricingGroup, PricingItem } from "../lib/types";

interface RowDraft {
  priceInr: string;
  expressMultiplier: string;
  active: boolean;
}

function draftsFrom(groups: PricingGroup[]): Record<string, RowDraft> {
  const d: Record<string, RowDraft> = {};
  for (const g of groups) {
    for (const item of g.items) {
      d[item.id] = {
        priceInr: String(item.pricePaise / 100),
        expressMultiplier: String(item.expressMultiplier),
        active: item.active,
      };
    }
  }
  return d;
}

/**
 * Pricing editor (Mobile Phase 3) — the web /admin/pricing editor,
 * native. Every row is one price_items record; saving PATCHes
 * /api/admin/pricing/[id] and takes effect immediately, because the
 * storefront and checkout read the catalogue DB-first.
 */
export default function AdminPricingScreen() {
  const [groups, setGroups] = useState<PricingGroup[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const fresh = await fetchPricing();
      setGroups(fresh);
      setDrafts(draftsFrom(fresh));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load pricing.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function isDirty(item: PricingItem): boolean {
    const d = drafts[item.id];
    if (!d) return false;
    return (
      d.priceInr !== String(item.pricePaise / 100) ||
      d.expressMultiplier !== String(item.expressMultiplier) ||
      d.active !== item.active
    );
  }

  async function saveRow(item: PricingItem) {
    const draft = drafts[item.id];
    if (!draft) return;
    const price = Number(draft.priceInr);
    const multiplier = Number(draft.expressMultiplier);
    if (!Number.isFinite(price) || price < 0) {
      setRowError((r) => ({ ...r, [item.id]: "Enter a valid price (₹0 or more)." }));
      return;
    }
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 5) {
      setRowError((r) => ({ ...r, [item.id]: "Express multiplier must be between 1 and 5." }));
      return;
    }
    setSavingId(item.id);
    setRowError((r) => ({ ...r, [item.id]: "" }));
    setFeedback(null);
    try {
      // Web conversion rule: Math.round(rupees * 100) paise.
      const json = await patchPricing(item.id, {
        pricePaise: Math.round(price * 100),
        expressMultiplier: multiplier,
        active: draft.active,
      });
      setFeedback(
        `${item.name} is now ${formatPaise(json.item.pricePaise)} ${json.item.unitLabel} — live on the pricing page and at checkout.`,
      );
      await load();
    } catch (e) {
      setRowError((r) => ({
        ...r,
        [item.id]: e instanceof ApiError ? e.message : "Could not save. Please try again.",
      }));
    } finally {
      setSavingId(null);
    }
  }

  if (error && !groups) {
    return (
      <Screen admin>
        <ErrorBlock message={error} onRetry={() => void load()} />
      </Screen>
    );
  }
  if (!groups) {
    return (
      <Screen admin>
        <LoadingBlock label="Loading pricing…" />
      </Screen>
    );
  }

  return (
    <Screen admin>
      <Title>Pricing editor</Title>
      <Subtitle>Changes go live on the pricing page and at checkout as soon as they save.</Subtitle>
      {feedback ? (
        <Card>
          <Text style={{ color: "#15803d", fontWeight: "700", fontSize: 14 }}>{feedback}</Text>
        </Card>
      ) : null}

      {groups.map((group) => (
        <View key={group.serviceId} style={{ gap: 12 }}>
          <Text style={{ fontSize: 17, fontWeight: "800" }}>{group.title}</Text>
          {group.items.map((item) => {
            const draft = drafts[item.id];
            if (!draft) return null;
            const dirty = isDirty(item);
            return (
              <Card key={item.id} style={item.active ? undefined : { opacity: 0.65 }}>
                <Text style={{ fontWeight: "700", fontSize: 14 }}>{item.name}</Text>
                <Text style={styles.muted}>
                  Currently {formatPaise(item.pricePaise)} {item.unitLabel} · express{" "}
                  {item.expressMultiplier}×
                </Text>
                <Field
                  label="Price (₹)"
                  keyboardType="decimal-pad"
                  value={draft.priceInr}
                  onChangeText={(t) =>
                    setDrafts((d) => ({ ...d, [item.id]: { ...draft, priceInr: t } }))
                  }
                />
                <Field
                  label="Express multiplier"
                  keyboardType="decimal-pad"
                  value={draft.expressMultiplier}
                  onChangeText={(t) =>
                    setDrafts((d) => ({ ...d, [item.id]: { ...draft, expressMultiplier: t } }))
                  }
                />
                <ToggleRow
                  label="Active"
                  value={draft.active}
                  onValueChange={(v) =>
                    setDrafts((d) => ({ ...d, [item.id]: { ...draft, active: v } }))
                  }
                />
                {rowError[item.id] ? <Text style={styles.errorText}>{rowError[item.id]}</Text> : null}
                <PrimaryButton
                  label={savingId === item.id ? "Saving…" : "Save"}
                  disabled={!dirty || savingId === item.id}
                  onPress={() => void saveRow(item)}
                />
              </Card>
            );
          })}
        </View>
      ))}
    </Screen>
  );
}
