import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  Card,
  Chip,
  ErrorBlock,
  LoadingBlock,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  styles,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { ApiError, placeOrder } from "../../lib/api";
import { loadServiceAreas, type ServiceArea } from "../../lib/areas";
import {
  loadCatalogue,
  qtyStep,
  type StorefrontCatalogue,
} from "../../lib/catalogue";
import { brand } from "../../lib/config";
import { formatPaise, prettyDate, toDateStr } from "../../lib/format";
import { PICKUP_SLOTS } from "../../lib/order-flow";
import {
  catalogueKey,
  computeOrderTotals,
  type OrderItemInput,
} from "../../lib/totals";

const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{9}$/;

/**
 * Place an order (Mobile Phase 1).
 *
 * Ordering requires sign-in — stated plainly below when signed out;
 * there is no demo mode in the app. The total preview is computed
 * with the ported totals engine (src/lib/totals.ts) and sent as
 * expectedTotalPaise; the server re-computes from the database and
 * rejects any mismatch. Payment is Pay on Delivery; a gift voucher
 * code can be added (verified and applied by the server, never
 * previewed locally — same rule as the web order form).
 */
export default function PlaceOrderScreen() {
  const { user, profileName } = useAuth();

  const [catalogue, setCatalogue] = useState<StorefrontCatalogue | null>(null);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // null = untouched: the field shows the profile name as a prefill
  // until the customer types over it.
  const [name, setName] = useState<string | null>(null);
  const displayName = name ?? profileName ?? "";
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [area, setArea] = useState<ServiceArea | null>(null);
  const [pickupDate, setPickupDate] = useState<string>(() => toDateStr(new Date()));
  const [pickupSlot, setPickupSlot] = useState<string>(PICKUP_SLOTS[0]);
  const [deliveryType, setDeliveryType] = useState<"regular" | "express">("regular");
  const [voucherCode, setVoucherCode] = useState("");
  const [note, setNote] = useState("");

  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadCatalogue(), loadServiceAreas()])
      .then(([c, a]) => {
        if (!mounted) return;
        setCatalogue(c);
        setAreas(a);
      })
      .catch(() => {
        if (mounted) setLoadError("Could not load the order form. Check your connection and reopen the app.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const days = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      out.push(toDateStr(d));
    }
    return out;
  }, []);

  const items: OrderItemInput[] = useMemo(() => {
    if (!catalogue) return [];
    const list: OrderItemInput[] = [];
    for (const entry of catalogue.entries) {
      const qty = quantities[catalogueKey(entry.serviceSlug, entry.itemName)] ?? 0;
      if (qty > 0) list.push({ serviceSlug: entry.serviceSlug, itemName: entry.itemName, qty });
    }
    return list;
  }, [catalogue, quantities]);

  const totals = useMemo(() => {
    if (!catalogue || items.length === 0) return null;
    return computeOrderTotals({
      items,
      deliveryType,
      isFirstOrder: true, // no coupon field in the app — value is unused without one
      catalogue: catalogue.entries,
    });
  }, [catalogue, items, deliveryType]);

  function bump(key: string, step: number, delta: number) {
    setQuantities((q) => {
      const next = Math.max(0, Math.round(((q[key] ?? 0) + delta * step) * 10) / 10);
      return { ...q, [key]: next };
    });
  }

  async function submit() {
    setFormError(null);
    if (!totals || !totals.ok) {
      setFormError(totals && !totals.ok ? totals.error : "Add at least one item to your order.");
      return;
    }
    if (displayName.trim().length < 2) return setFormError("Enter your full name.");
    if (!PHONE_RE.test(phone.trim())) return setFormError("Enter a valid 10-digit Indian mobile number.");
    if (addressLine.trim().length < 8) return setFormError("Enter your full address (house no., street).");
    if (!area) return setFormError("Select your area.");

    setPlacing(true);
    try {
      const result = await placeOrder({
        name: displayName.trim(),
        phone: phone.trim(),
        addressLine: addressLine.trim(),
        area: area.area,
        city: area.city,
        pincode: area.pincode,
        pickupDate,
        pickupSlot,
        deliveryType,
        note: note.trim() || undefined,
        items,
        paymentMethod: "cod",
        voucherCode: voucherCode.trim() || undefined,
        expectedTotalPaise: totals.totalPaise,
      });
      router.replace(`/order/${result.orderId}`);
    } catch (e) {
      if (e instanceof ApiError) {
        const field = e.fieldErrors ? Object.values(e.fieldErrors)[0] : undefined;
        setFormError(field ?? e.message);
      } else {
        setFormError("Could not place the order. Check your connection and try again.");
      }
    } finally {
      setPlacing(false);
    }
  }

  if (!user) {
    return (
      <Screen>
        <Title>Sign in to place an order</Title>
        <Subtitle>
          Orders are placed from your Z-clean account so you can track them and so our team can
          reach you about pickup. Browsing prices on the Home tab needs no account.
        </Subtitle>
        <PrimaryButton label="Sign in" onPress={() => router.push("/login")} />
        <PrimaryButton label="Create an account" onPress={() => router.push("/register")} />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <ErrorBlock message={loadError} />
      </Screen>
    );
  }
  if (!catalogue) {
    return (
      <Screen>
        <LoadingBlock label="Loading the order form…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>What are we picking up?</Title>
      {catalogue.groups.map((group) => (
        <Card key={group.title}>
          <Text style={styles.label}>{group.title}</Text>
          {group.items.map((item) => {
            const key = catalogueKey(item.serviceSlug, item.itemName);
            const step = qtyStep(item.unitLabel);
            const qty = quantities[key] ?? 0;
            const unitPaise = Math.round(item.priceInr * 100);
            const displayUnit =
              deliveryType === "express" ? Math.round(unitPaise * item.expressMultiplier) : unitPaise;
            return (
              <View key={key} style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: brand.ink }}>{item.itemName}</Text>
                  <Text style={styles.muted}>
                    {formatPaise(displayUnit)} {item.unitLabel}
                    {deliveryType === "express" ? " · express rate" : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Pressable
                    onPress={() => bump(key, step, -1)}
                    style={stepperBtn}
                    accessibilityLabel={`Remove ${item.itemName}`}
                  >
                    <Text style={stepperText}>−</Text>
                  </Pressable>
                  <Text style={{ minWidth: 34, textAlign: "center", fontWeight: "700" }}>
                    {qty > 0 ? qty : ""}
                  </Text>
                  <Pressable
                    onPress={() => bump(key, step, 1)}
                    style={stepperBtn}
                    accessibilityLabel={`Add ${item.itemName}`}
                  >
                    <Text style={stepperText}>＋</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </Card>
      ))}

      <Card>
        <Text style={styles.label}>Delivery speed</Text>
        <View style={styles.rowWrap}>
          <Chip label="Regular" selected={deliveryType === "regular"} onPress={() => setDeliveryType("regular")} />
          <Chip label="Express (1.5×)" selected={deliveryType === "express"} onPress={() => setDeliveryType("express")} />
        </View>

        <Text style={styles.label}>Your details</Text>
        <TextInput style={styles.input} placeholder="Full name" value={displayName} onChangeText={setName} autoComplete="name" />
        <TextInput
          style={styles.input}
          placeholder="Mobile number (10-digit)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <TextInput
          style={styles.input}
          placeholder="Address — house no., street, landmark"
          value={addressLine}
          onChangeText={setAddressLine}
        />
        <Text style={styles.label}>Area</Text>
        <View style={styles.rowWrap}>
          {areas.map((a) => (
            <Chip
              key={`${a.area}-${a.pincode}`}
              label={`${a.area} · ${a.pincode}`}
              selected={area?.area === a.area && area?.pincode === a.pincode}
              onPress={() => setArea(a)}
            />
          ))}
        </View>

        <Text style={styles.label}>Pickup date</Text>
        <View style={styles.rowWrap}>
          {days.map((d) => (
            <Chip key={d} label={prettyDate(d)} selected={pickupDate === d} onPress={() => setPickupDate(d)} />
          ))}
        </View>

        <Text style={styles.label}>Pickup time</Text>
        <View style={styles.rowWrap}>
          {PICKUP_SLOTS.map((s) => (
            <Chip key={s} label={s} selected={pickupSlot === s} onPress={() => setPickupSlot(s)} />
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Note for our team (optional)"
          value={note}
          onChangeText={setNote}
          maxLength={500}
        />
        <TextInput
          style={styles.input}
          placeholder="Gift voucher code (optional)"
          value={voucherCode}
          onChangeText={setVoucherCode}
          autoCapitalize="characters"
        />
        <Text style={styles.muted}>
          Payment: Pay on Delivery. A voucher is verified by the server when the order is placed —
          a prepaid gift card reduces what you pay at the door.
        </Text>
      </Card>

      <Card>
        <Text style={styles.label}>Summary</Text>
        {totals && totals.ok ? (
          <>
            {totals.lines.map((l) => (
              <View key={catalogueKey(l.serviceSlug, l.itemName)} style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  {l.itemName} × {l.qty}
                </Text>
                <Text style={styles.totalValue}>{formatPaise(l.lineTotalPaise)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatPaise(totals.subtotalPaise)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Pickup & delivery</Text>
              <Text style={styles.totalValue}>
                {totals.deliveryFeePaise === 0 ? "Free" : formatPaise(totals.deliveryFeePaise)}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.grandLabel}>To pay on delivery</Text>
              <Text style={styles.grandValue}>{formatPaise(totals.totalPaise)}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.muted}>
            {totals && !totals.ok ? totals.error : "Add items above — minimum order ₹199."}
          </Text>
        )}
        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
        <PrimaryButton label="Place order — pay on delivery" onPress={submit} busy={placing} />
      </Card>
    </Screen>
  );
}

const stepperBtn = {
  width: 38,
  height: 38,
  borderRadius: 19,
  borderWidth: 1,
  borderColor: brand.teal,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  backgroundColor: brand.white,
};
const stepperText = { fontSize: 18, fontWeight: "700" as const, color: brand.tealDark };
