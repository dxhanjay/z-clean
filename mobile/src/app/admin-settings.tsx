import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text } from "react-native";
import { Field } from "../components/forms";
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
import { ApiError, fetchSettings, patchSettings } from "../lib/api";
import type { SettingRow } from "../lib/types";

/**
 * Business Settings editor (Mobile Phase 3) — mirrors web
 * AdminSettings exactly: same META (labels, help, paise keys edited
 * in rupees, multiline keys), same draft→raw conversion, and only
 * changed keys are PATCHed ({ values } → /api/admin/settings).
 * The footer and contact page read phone/WhatsApp from these rows,
 * so saving here changes the site immediately.
 */

interface SettingMeta {
  label: string;
  help: string;
  /** Stored in paise; edited as rupees. */
  paise?: boolean;
  multiline?: boolean;
}

const META: Record<string, SettingMeta> = {
  business_phone: {
    label: "Business phone",
    help: "Shown in the site footer and on the contact page. (The current number is the DEMO placeholder — replace it with the real business number before launch.)",
  },
  business_whatsapp: {
    label: "WhatsApp number",
    help: "WhatsApp contact for the business, in the same format as the phone number.",
  },
  business_email: {
    label: "Business email",
    help: "Public contact email for the business.",
  },
  business_address: {
    label: "Business address",
    help: "The plant / shop address shown to customers.",
    multiline: true,
  },
  opening_hours: {
    label: "Opening hours",
    help: "Shown to customers, e.g. “Mon–Sun, 9 AM – 9 PM”.",
  },
  free_delivery_threshold_paise: {
    label: "Free delivery threshold (₹)",
    help: "Orders at or above this amount get free pickup & delivery. Stored in paise in the settings table.",
    paise: true,
  },
  minimum_order_paise: {
    label: "Minimum order (₹)",
    help: "The smallest order value accepted. Stored in paise in the settings table.",
    paise: true,
  },
  first_order_offer_note: {
    label: "First-order offer note",
    help: "Short line describing the current first-order offer.",
    multiline: true,
  },
};

interface SettingView {
  key: string;
  /** Raw stored value (paise string for money keys). */
  value: string;
  /** What the input shows (rupees for money keys). */
  draft: string;
}

function toView(row: SettingRow): SettingView {
  const raw = row.value ?? "";
  const meta = META[row.key];
  return {
    key: row.key,
    value: raw,
    draft: meta?.paise && raw !== "" ? String(Number(raw) / 100) : raw,
  };
}

function draftToRaw(key: string, draft: string): string | null {
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  if (META[key]?.paise) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? String(Math.round(n * 100)) : trimmed;
  }
  return trimmed;
}

export default function AdminSettingsScreen() {
  const [settings, setSettings] = useState<SettingView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSettings((await fetchSettings()).map(toView));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load settings.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (error && !settings) {
    return (
      <Screen admin>
        <ErrorBlock message={error} onRetry={() => void load()} />
      </Screen>
    );
  }
  if (!settings) {
    return (
      <Screen admin>
        <LoadingBlock label="Loading settings…" />
      </Screen>
    );
  }

  const changed = settings.filter(
    (s) => draftToRaw(s.key, s.draft) !== (s.value === "" ? null : s.value),
  );

  async function submit() {
    if (changed.length === 0) return;
    setBusy(true);
    setFeedback(null);
    setFormError(null);
    const values: Record<string, string | null> = {};
    for (const s of changed) values[s.key] = draftToRaw(s.key, s.draft);
    try {
      const saved = await patchSettings(values);
      setSettings(saved.map(toView));
      setFeedback("Settings saved — the footer and contact page now use the new values.");
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen admin>
      <Title>Business settings</Title>
      <Subtitle>The same settings rows the website reads — edits apply immediately.</Subtitle>
      {feedback ? (
        <Card>
          <Text style={{ color: "#15803d", fontWeight: "700", fontSize: 14 }}>{feedback}</Text>
        </Card>
      ) : null}

      <Card>
        {settings.map((s) => {
          const meta = META[s.key];
          return (
            <Field
              key={s.key}
              label={meta ? meta.label : s.key}
              hint={meta?.help}
              value={s.draft}
              onChangeText={(t) =>
                setSettings((prev) =>
                  (prev ?? []).map((x) => (x.key === s.key ? { ...x, draft: t } : x)),
                )
              }
              multiline={meta?.multiline}
              keyboardType={meta?.paise ? "decimal-pad" : "default"}
            />
          );
        })}
        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
        <PrimaryButton
          label={
            busy
              ? "Saving…"
              : changed.length > 0
                ? `Save ${changed.length} change${changed.length > 1 ? "s" : ""}`
                : "No changes"
          }
          disabled={busy || changed.length === 0}
          onPress={() => void submit()}
        />
      </Card>
    </Screen>
  );
}
