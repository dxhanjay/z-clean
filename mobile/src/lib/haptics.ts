import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Tiny success feedback (performance/interaction polish).
 * One shared helper so every "that worked" moment feels the same;
 * a no-op on web and fully guarded — haptics must never break a flow.
 */
export function successTap(): void {
  if (Platform.OS === "web") return;
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      // Haptics unavailable on this device — ignore.
    });
  } catch {
    // Haptics unavailable on this device — ignore.
  }
}
