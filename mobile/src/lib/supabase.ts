import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

/**
 * The app's Supabase client — same project as the web app. The
 * session is persisted in AsyncStorage and refreshed automatically;
 * API calls to the Next backend carry the session's access token as
 * a Bearer header (see src/lib/api.ts and the web README's Mobile
 * section for the server-side contract).
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
