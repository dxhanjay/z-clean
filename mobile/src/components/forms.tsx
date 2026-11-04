import { Pressable, Switch, Text, TextInput, View, type TextInputProps } from "react-native";
import { brand } from "../lib/config";
import { styles } from "./ui";

/**
 * Form building blocks for the admin screens (Mobile Phase 2) —
 * same visual language as the Phase 1 components in ui.tsx.
 */

export function Field({
  label,
  hint,
  error,
  ...inputProps
}: {
  label: string;
  hint?: string;
  error?: string;
} & TextInputProps) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={brand.inkSoft} {...inputProps} />
      {hint ? <Text style={[styles.muted, { textAlign: "left", fontSize: 12 }]}>{hint}</Text> : null}
      {error ? <Text style={[styles.errorText, { textAlign: "left", fontSize: 12 }]}>{error}</Text> : null}
    </View>
  );
}

/** Single-select rendered as wrap chips (value null = the "none" option). */
export function SelectChips<T extends string>({
  label,
  options,
  value,
  onChange,
  includeNoneLabel,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  /** When set, a first chip with this label selects null. */
  includeNoneLabel?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rowWrap}>
        {includeNoneLabel ? (
          <Pressable
            onPress={() => onChange(null)}
            style={[styles.chip, value === null && styles.chipSelected]}
          >
            <Text style={[styles.chipText, value === null && styles.chipTextSelected]}>
              {includeNoneLabel}
            </Text>
          </Pressable>
        ) : null}
        {options.map((o) => (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.chip, value === o.value && styles.chipSelected]}
          >
            <Text style={[styles.chipText, value === o.value && styles.chipTextSelected]}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Multi-select rendered as toggling chips. */
export function MultiChips({
  label,
  options,
  values,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rowWrap}>
        {options.map((o) => {
          const selected = values.includes(o.value);
          return (
            <Pressable
              key={o.value}
              onPress={() => onToggle(o.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.rowBetween, { paddingVertical: 2 }]}>
      <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: brand.teal, false: "#d1d5db" }} />
    </View>
  );
}

export function StepperRow({
  label,
  value,
  onChange,
  min = 0,
  max = 100000,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={() => onChange(clamp(value - 1))}
          style={[styles.chip, { paddingHorizontal: 18, paddingVertical: 9 }]}
        >
          <Text style={{ fontSize: 17, fontWeight: "800", color: brand.ink }}>−</Text>
        </Pressable>
        <TextInput
          style={[styles.input, { width: 84, textAlign: "center" }]}
          keyboardType="number-pad"
          value={String(value)}
          onChangeText={(t) => onChange(clamp(parseInt(t.replace(/\D/g, ""), 10) || 0))}
        />
        <Pressable
          onPress={() => onChange(clamp(value + 1))}
          style={[styles.chip, { paddingHorizontal: 18, paddingVertical: 9 }]}
        >
          <Text style={{ fontSize: 17, fontWeight: "800", color: brand.ink }}>＋</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Flatten a server fieldErrors map (values may be string[]) to one line per field. */
export function fieldErrorText(fieldErrors: Record<string, string> | undefined, field: string): string | undefined {
  const raw = fieldErrors?.[field] as unknown;
  if (Array.isArray(raw)) return raw.join(" ");
  return typeof raw === "string" ? raw : undefined;
}
