import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import { registerPushToken, unregisterPushToken } from "./api";

/**
 * Push notifications client (Delta 2).
 *
 * Registers this device's Expo push token with the backend
 * (POST /api/push/register → `push_tokens`) so order-status pushes
 * sent by src/lib/push.ts on the server can reach it, and routes
 * notification taps to the order tracking screen.
 *
 * Platform reality, handled gracefully — never a crash or a scary
 * error, just a status the caller may ignore:
 *   - Web: no-op ("unsupported") — the PWA does not do push.
 *   - Expo Go on Android (SDK 53+): Expo REMOVED remote push from
 *     Expo Go; getExpoPushTokenAsync cannot work there →
 *     "unsupported". Standalone / development builds work.
 *   - Simulators/emulators: no push transport → "unsupported".
 *   - Permission declined → "denied" (the app simply stays silent).
 *   - The local "Order updates" preference off → "disabled", and
 *     turning it off deletes the server-side token.
 *
 * Delivery credentials (FCM V1 for Android, APNs for iOS) are
 * owner-gated EAS-side configuration — registration here is complete
 * regardless; see the web README's Delta 2 section.
 */

const ENABLED_KEY = "zclean_push_enabled_v1";
const TOKEN_KEY = "zclean_push_token_v1";

/** Android notification channel for order updates (matches app.json). */
export const ORDERS_CHANNEL_ID = "orders";

export type PushRegistration =
  | { status: "registered"; token: string }
  | { status: "unsupported"; reason: string }
  | { status: "denied" }
  | { status: "disabled" }
  | { status: "error"; message: string };

/** Local preference — default ON until the user turns it off. */
export async function getPushEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) !== "off";
  } catch {
    return true;
  }
}

async function getStoredToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Register this device for order-update pushes. Fire-and-forget by
 * design: AuthContext calls it after login / session restore and no
 * caller should ever block or fail on the outcome.
 */
export async function registerForPush(): Promise<PushRegistration> {
  try {
    if (Platform.OS === "web") {
      return { status: "unsupported", reason: "web" };
    }
    if (!(await getPushEnabled())) {
      return { status: "disabled" };
    }
    const inExpoGo =
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    if (inExpoGo && Platform.OS === "android") {
      // Remote push was removed from Expo Go (SDK 53+, Android).
      return { status: "unsupported", reason: "expo-go-android" };
    }
    if (!Device.isDevice) {
      return { status: "unsupported", reason: "simulator" };
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(ORDERS_CHANNEL_ID, {
        name: "Order updates",
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#22786d",
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) {
      return { status: "denied" };
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      return { status: "error", message: "EAS project id is not configured." };
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await AsyncStorage.setItem(TOKEN_KEY, token);
    await registerPushToken(token, Platform.OS === "ios" ? "ios" : "android");
    return { status: "registered", token };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Push registration failed.",
    };
  }
}

/**
 * Remove this device's registration (logout hygiene / preference
 * off): DELETE the server row for the stored token, then forget the
 * token locally. Silent on every failure — the server also prunes
 * dead tokens on its own when Expo reports them unregistered.
 */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await getStoredToken();
    if (token) {
      await unregisterPushToken(token).catch(() => undefined);
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Degrade silently — see header.
  }
}

/**
 * Apply the "Order updates" preference: persist it locally, then
 * register (on) or unregister (off) to match. Server-side preference
 * storage is a follow-up (see README) — the token row's presence IS
 * the server-side state today.
 */
export async function applyPushPreference(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? "on" : "off");
  } catch {
    // Preference persistence is best-effort; still honour the choice
    // for this session below.
  }
  if (enabled) {
    await registerForPush();
  } else {
    await unregisterPush();
  }
}

/** Deep-link a notification payload to the order tracking screen. */
function routeFromNotificationData(
  data: Record<string, unknown> | undefined,
): void {
  const orderId = typeof data?.orderId === "string" ? data.orderId : null;
  if (orderId) {
    router.push(`/order/${orderId}`);
  }
}

let listenersInstalled = false;

/**
 * Install the foreground presentation handler and the tap listener.
 * Called once from the root layout. No-op on web; safe in Expo Go
 * (the listeners simply never fire for remote pushes there).
 */
export function setupPushNotifications(): void {
  if (listenersInstalled || Platform.OS === "web") return;
  listenersInstalled = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    routeFromNotificationData(response.notification.request.content.data);
  });

  // Cold start: the app was launched by tapping a notification.
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) {
        routeFromNotificationData(response.notification.request.content.data);
      }
    })
    .catch(() => undefined);
}
