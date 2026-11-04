import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { brand } from "../lib/config";

/** Shared building blocks — one visual language with the web app (brand teal). */

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.screenContent, style]}>
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.primaryBtn,
        (disabled || busy) && styles.btnDisabled,
        pressed && !disabled && styles.btnPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.primaryBtnText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ghostBtn,
        disabled && styles.btnDisabled,
        pressed && !disabled && styles.btnPressed,
      ]}
    >
      <Text style={styles.ghostBtnText}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = "teal" }: { label: string; tone?: "teal" | "amber" | "green" | "red" | "grey" }) {
  const tones = {
    teal: { bg: brand.tealSoft, fg: brand.tealDark },
    amber: { bg: brand.amberSoft, fg: brand.amber },
    green: { bg: brand.greenSoft, fg: brand.green },
    red: { bg: brand.dangerSoft, fg: brand.danger },
    grey: { bg: "#f3f4f6", fg: brand.inkSoft },
  } as const;
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function paymentBadgeTone(status: string): "teal" | "amber" | "green" | "red" | "grey" {
  if (status === "paid") return "green";
  if (status === "failed") return "red";
  if (status === "cod_pending" || status === "partially_paid") return "amber";
  return "grey";
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.centerBlock}>
      <ActivityIndicator color={brand.teal} size="large" />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centerBlock}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? <GhostButton label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyBlock({ message }: { message: string }) {
  return (
    <View style={styles.centerBlock}>
      <Text style={styles.muted}>{message}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.pageBg },
  screenContent: { padding: 16, paddingBottom: 32, gap: 12 },
  title: { fontSize: 24, fontWeight: "800", color: brand.ink },
  subtitle: { fontSize: 14, color: brand.inkSoft, lineHeight: 20 },
  card: {
    backgroundColor: brand.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: brand.tealBorder,
    padding: 14,
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: brand.teal,
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  ghostBtn: {
    borderColor: brand.teal,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignItems: "center",
    backgroundColor: brand.white,
  },
  ghostBtnText: { color: brand.tealDark, fontSize: 14, fontWeight: "700" },
  btnDisabled: { opacity: 0.55 },
  btnPressed: { opacity: 0.85 },
  chip: {
    borderWidth: 1,
    borderColor: brand.tealBorder,
    backgroundColor: brand.white,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  chipSelected: { backgroundColor: brand.teal, borderColor: brand.teal },
  chipText: { fontSize: 13, fontWeight: "600", color: brand.ink },
  chipTextSelected: { color: "#fff" },
  badge: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "700" },
  centerBlock: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 40 },
  muted: { fontSize: 14, color: brand.inkSoft, textAlign: "center", lineHeight: 20 },
  errorText: { fontSize: 14, color: brand.danger, textAlign: "center", lineHeight: 20, fontWeight: "600" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  label: { fontSize: 13, fontWeight: "700", color: brand.ink },
  input: {
    borderWidth: 1,
    borderColor: brand.tealBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: brand.ink,
    backgroundColor: brand.white,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { fontSize: 14, color: brand.inkSoft },
  totalValue: { fontSize: 14, fontWeight: "600", color: brand.ink },
  grandLabel: { fontSize: 16, fontWeight: "800", color: brand.ink },
  grandValue: { fontSize: 16, fontWeight: "800", color: brand.ink },
});
