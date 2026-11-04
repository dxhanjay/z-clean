import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

/**
 * The app's Supabase client — same project as the web app.
 *
 * Session storage is platform-aware:
 *  - Native (Android/iOS): `expo-secure-store` (Android Keystore /
 *    iOS Keychain), so refresh tokens — which can carry an admin
 *    role — never sit in plaintext app storage (audit blocker #6).
 *    SecureStore refuses values over 2048 bytes, so an oversized
 *    value spills to AsyncStorage instead (and any stale copy in
 *    the other store is removed, keeping reads consistent).
 *  - Web: AsyncStorage, i.e. localStorage — unchanged behaviour;
 *    SecureStore is never called on web.
 *
 * Migration: reads check SecureStore first, then AsyncStorage, so
 * a session saved by an older build is picked up once and re-stored
 * through this adapter on the next refresh; in the worst case the
 * user simply signs in again once after the update.
 */
const SECURE_STORE_VALUE_LIMIT = 2048;

const secureStoreAdapter: SupportedStorage = {
  getItem: async (key) => {
    const secure = await SecureStore.getItemAsync(key);
    if (secure !== null) return secure;
    return AsyncStorage.getItem(key);
  },
  setItem: async (key, value) => {
    if (value.length > SECURE_STORE_VALUE_LIMIT) {
      await SecureStore.deleteItemAsync(key);
      await AsyncStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.removeItem(key);
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key) => {
    await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key);
  },
};

const storage: SupportedStorage =
  Platform.OS === "web" ? AsyncStorage : secureStoreAdapter;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
