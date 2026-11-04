import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { brand } from "../lib/config";
import {
  ApiError,
  completeHandover,
  fetchEmployees,
  regenerateOtp,
} from "../lib/api";
import { formatPaise, formatWhen } from "../lib/format";
import { handoverFlagLabel, receivingRoles } from "../lib/handovers";
import { staffRoleLabel } from "../lib/org";
import type { AdminOrderDetail, Employee } from "../lib/types";
import { Field, StepperRow, ToggleRow } from "./forms";
import QrScanner from "./QrScanner";
import { Badge, Card, GhostButton, PrimaryButton, styles } from "./ui";

/**
 * Handover chain panel (Mobile Phase 2) — admin order detail.
 *
 * Mirrors the web admin's Phase 8 panel (AdminHandovers.tsx): the
 * completed chain, the order's QR + OTP states, and the NEXT point's
 * completion card. Staff act from the admin console and SELECT the
 * employee physically receiving the items; the server validates the
 * employee's role, the OTP/QR credential, the sequence and the
 * lifecycle rules, and its error messages are shown verbatim.
 * New in the app: QR points can be completed with the device camera
 * (expo-camera) as well as by pasting/typing the code.
 */
export default function HandoverPanel({
  order,
  onChanged,
  feedback,
  setFeedback,
}: {
  order: AdminOrderDetail;
  onChanged: () => void;
  /** Success banner lives in the parent so it survives the panel
   * remounting (keyed by next point) after a completed handover. */
  feedback: string | null;
  setFeedback: (message: string | null) => void;
}) {
  const nextPoint = order.next_point;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [otp, setOtp] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [quantity, setQuantity] = useState(order.item_count);
  const [codCollected, setCodCollected] = useState(false);
  const [missingItem, setMissingItem] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [regenBusy, setRegenBusy] = useState<"pickup" | "delivery" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEmployees()
      .then((list) => {
        if (!cancelled) setEmployees(list);
      })
      .catch(() => {
        // The picker simply stays empty; the server error surfaces on submit.
      });
    return () => {
      cancelled = true;
    };
  }, [order.handovers.length]);

  const eligible = useMemo(() => {
    if (!nextPoint) return [];
    const allowed = receivingRoles(nextPoint);
    return employees.filter(
      (e) => e.employmentStatus === "active" && e.roles.some((r) => allowed.includes(r)),
    );
  }, [employees, nextPoint]);

  /* The form resets by REMOUNTING: the parent keys this panel by the
     order's next point + status + handover count, so a completed
     handover (which advances the chain) mounts a fresh form — no
     reset effect needed. Until the operator picks someone, the
     selection defaults to the first eligible employee. */
  const effectiveEmployeeId = employeeId || eligible[0]?.id || "";

  const codCollectible =
    nextPoint?.id === "delivery" &&
    order.payment_method === "cod" &&
    order.payment_status === "cod_pending";
  const outstandingPaise = Math.max(0, order.total_paise - order.voucher_redeemed_paise);
  const completedIds = useMemo(
    () => new Set(order.handovers.map((h) => h.pointId)),
    [order.handovers],
  );

  const regenerate = useCallback(
    async (which: "pickup" | "delivery") => {
      setRegenBusy(which);
      setFeedback(null);
      setFormError(null);
      setErrorCode(undefined);
      try {
        const res = await regenerateOtp(order.id, which);
        setFeedback(
          `New ${which} OTP: ${res.otp} — the customer can also see it on their order page. The failed-attempt lock is cleared.`,
        );
        onChanged();
      } catch (e) {
        setFormError(e instanceof ApiError ? e.message : "The OTP could not be regenerated.");
      } finally {
        setRegenBusy(null);
      }
    },
    [order.id, onChanged, setFeedback],
  );

  async function submit() {
    if (!nextPoint) return;
    setBusy(true);
    setFeedback(null);
    setFormError(null);
    setErrorCode(undefined);
    try {
      const res = await completeHandover(order.id, {
        pointId: nextPoint.id,
        toEmployeeId: effectiveEmployeeId,
        method: nextPoint.method,
        otp: nextPoint.method === "otp" ? otp.trim() : undefined,
        qrToken: nextPoint.method === "qr" ? qrInput.trim() : undefined,
        quantity,
        codCollected: codCollectible && codCollected ? true : undefined,
        missingItem: missingItem || undefined,
        note: note.trim() || undefined,
      });
      setFeedback(
        `Handover recorded — ${nextPoint.label}.` +
          (res.nextPoint ? ` Next: ${res.nextPoint.label}.` : " The chain is complete."),
      );
      onChanged();
    } catch (e) {
      if (e instanceof ApiError) {
        setFormError(e.message);
        setErrorCode(e.code);
      } else {
        setFormError("The handover could not be recorded. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const otpRow = (kind: "pickup" | "delivery", set: boolean, usedAt: string | null) => {
    const pointDone = completedIds.has(kind);
    return (
      <View style={{ gap: 4, paddingVertical: 4 }}>
        <Text style={styles.muted}>
          <Text style={{ fontWeight: "700", color: brand.ink }}>
            {kind === "pickup" ? "Pickup" : "Delivery"} OTP
          </Text>{" "}
          —{" "}
          {usedAt
            ? `used ${formatWhen(usedAt)}`
            : !set
              ? "not generated yet"
              : pointDone
                ? "used"
                : "waiting to be used"}
        </Text>
        {(!set || order.otp_state.locked) && !pointDone ? (
          <GhostButton
            label={
              regenBusy === kind
                ? "Generating…"
                : !set
                  ? `Generate ${kind} OTP`
                  : `Regenerate ${kind} OTP`
            }
            disabled={regenBusy !== null}
            onPress={() => void regenerate(kind)}
          />
        ) : null}
      </View>
    );
  };

  return (
    <Card>
      <Text style={styles.label}>Handover chain</Text>
      <Text style={styles.muted}>
        Every stage transfer is verified (customer OTP at the doorsteps, this order{"'"}s QR code in
        between) and recorded against the employee who receives the items. You select the receiving
        employee; the action is audit-logged under your admin account.
      </Text>

      {feedback ? (
        <View style={{ backgroundColor: brand.greenSoft, borderRadius: 10, padding: 10 }}>
          <Text style={{ color: brand.green, fontWeight: "600", fontSize: 14 }}>{feedback}</Text>
        </View>
      ) : null}
      {formError ? (
        <View style={{ backgroundColor: brand.dangerSoft, borderRadius: 10, padding: 10, gap: 8 }}>
          <Text style={{ color: brand.danger, fontWeight: "600", fontSize: 14 }}>{formError}</Text>
          {errorCode === "OTP_LOCKED" && nextPoint?.method === "otp" && nextPoint.otpKind ? (
            <GhostButton
              label={`Regenerate ${nextPoint.otpKind} OTP`}
              disabled={regenBusy !== null}
              onPress={() => void regenerate(nextPoint.otpKind as "pickup" | "delivery")}
            />
          ) : null}
          {errorCode === "OTP_MISMATCH" ? (
            <Text style={{ color: brand.danger, fontSize: 13 }}>
              Failed attempts so far: {order.otp_state.attempts + 1} / 5 — at 5 the OTP locks until
              an admin regenerates it.
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Order QR + OTP states */}
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
        <View style={{ alignItems: "center", gap: 4 }}>
          {order.qr_payload ? (
            <View style={{ backgroundColor: "#fff", padding: 8, borderRadius: 10 }}>
              <QRCode value={order.qr_payload} size={120} />
            </View>
          ) : (
            <View
              style={{
                width: 136,
                height: 136,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#fff",
                borderRadius: 10,
                padding: 8,
              }}
            >
              <Text style={styles.muted}>No QR token on this order</Text>
            </View>
          )}
          <Text style={[styles.muted, { fontSize: 10, maxWidth: 150 }]}>{order.qr_payload ?? "—"}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 200 }}>
          {otpRow("pickup", order.otp_state.pickupSet, order.otp_state.pickupUsedAt)}
          {otpRow("delivery", order.otp_state.deliverySet, order.otp_state.deliveryUsedAt)}
          <Text style={[styles.muted, { fontSize: 12 }]}>
            Failed OTP attempts: {order.otp_state.attempts} / 5
            {order.otp_state.locked
              ? " — OTP verification is LOCKED until an OTP is regenerated."
              : "."}{" "}
            The codes themselves are shown only to the customer, on their order page.
          </Text>
        </View>
      </View>

      {/* Completed chain */}
      {order.handovers.length > 0 ? (
        <View style={{ gap: 8 }}>
          {order.handovers.map((h) => (
            <View
              key={h.id}
              style={{
                borderWidth: 1,
                borderColor: brand.tealBorder,
                borderRadius: 10,
                padding: 10,
                gap: 3,
              }}
            >
              <View style={styles.rowWrap}>
                <Text style={{ fontWeight: "700" }}>✓ {h.pointLabel}</Text>
                <Badge label={h.method === "otp" ? "OTP" : "QR"} tone="grey" />
              </View>
              <Text style={styles.muted}>
                {h.fromEmployeeName ?? h.fromStage} → {h.toEmployeeName ?? h.toStage} · {h.quantity}{" "}
                of {h.expectedQuantity} item{h.expectedQuantity === 1 ? "" : "s"} · {formatWhen(h.at)}
              </Text>
              {h.flags.length > 0 ? (
                <View style={styles.rowWrap}>
                  {h.flags.map((f) => (
                    <Badge key={f} label={`⚠ ${handoverFlagLabel(f)}`} tone="amber" />
                  ))}
                </View>
              ) : null}
              {h.note ? <Text style={styles.muted}>{h.note}</Text> : null}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.muted}>No handovers recorded yet.</Text>
      )}

      {/* Next point card */}
      {nextPoint ? (
        <View
          style={{
            borderWidth: 2,
            borderColor: brand.teal,
            borderRadius: 12,
            padding: 12,
            gap: 10,
          }}
        >
          <View style={styles.rowWrap}>
            <Text style={{ fontWeight: "800", fontSize: 15 }}>Next: {nextPoint.label}</Text>
            <Badge label={nextPoint.method === "otp" ? "Verify by OTP" : "Verify by QR"} />
          </View>
          <Text style={styles.muted}>
            {nextPoint.fromLabel} hands over to a{" "}
            {receivingRoles(nextPoint).map(staffRoleLabel).join(" or ")}.
          </Text>

          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Receiving employee</Text>
            {eligible.length === 0 ? (
              <Text style={[styles.errorText, { textAlign: "left" }]}>
                No active employee with the {receivingRoles(nextPoint).map(staffRoleLabel).join(" or ")}{" "}
                role — add one in Employees first.
              </Text>
            ) : (
              <View style={styles.rowWrap}>
                {eligible.map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => setEmployeeId(e.id)}
                    style={[styles.chip, effectiveEmployeeId === e.id && styles.chipSelected]}
                  >
                    <Text
                      style={[styles.chipText, effectiveEmployeeId === e.id && styles.chipTextSelected]}
                    >
                      {e.fullName} ({e.employeeCode})
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {nextPoint.method === "otp" ? (
            <View style={{ gap: 4 }}>
              <Text style={styles.label}>Customer{"'"}s {nextPoint.otpKind} OTP</Text>
              <TextInput
                style={[styles.input, { letterSpacing: 6, fontSize: 18 }]}
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                placeholder="6-digit code from the customer"
                placeholderTextColor={brand.inkSoft}
              />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Order QR code</Text>
              {scannerOpen ? (
                <QrScanner
                  onScanned={(value) => {
                    setQrInput(value);
                    setScannerOpen(false);
                  }}
                  onClose={() => setScannerOpen(false)}
                />
              ) : (
                <PrimaryButton label="📷 Scan the bag tag QR" onPress={() => setScannerOpen(true)} />
              )}
              <TextInput
                style={styles.input}
                value={qrInput}
                onChangeText={setQrInput}
                placeholder="…or paste the order's QR payload / token"
                placeholderTextColor={brand.inkSoft}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {order.qr_payload ? (
                <Pressable onPress={() => setQrInput(order.qr_payload ?? "")}>
                  <Text style={{ color: brand.tealDark, fontWeight: "600", fontSize: 13 }}>
                    Use the code printed for this order (shown above)
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}

          <StepperRow
            label={`Items handed over (expected ${order.item_count})`}
            value={quantity}
            onChange={setQuantity}
          />
          <Text style={[styles.muted, { fontSize: 12 }]}>
            A different count still completes the handover — it is recorded with a quantity-mismatch
            flag for follow-up.
          </Text>

          <ToggleRow label="Report a missing item (flagged, not a block)" value={missingItem} onValueChange={setMissingItem} />

          {codCollectible ? (
            <ToggleRow
              label={`Customer paid the outstanding ${formatPaise(outstandingPaise)} on delivery — record the Pay-on-Delivery collection`}
              value={codCollected}
              onValueChange={setCodCollected}
            />
          ) : null}

          <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={500} placeholder="e.g. One bag sealed separately" />

          <PrimaryButton
            label="Complete handover"
            busy={busy}
            disabled={!effectiveEmployeeId}
            onPress={() => void submit()}
          />
        </View>
      ) : (
        <Text style={styles.muted}>
          {order.status === "DELIVERED"
            ? order.handovers.length >= 11
              ? "The handover chain ran end to end for this order."
              : "This order is marked delivered. Its handover chain was not fully recorded (the status may have been set directly)."
            : order.status === "CANCELLED"
              ? "This order was cancelled — no handovers apply."
              : "This order is not in the handover flow yet (it is waiting on payment)."}
        </Text>
      )}
    </Card>
  );
}
