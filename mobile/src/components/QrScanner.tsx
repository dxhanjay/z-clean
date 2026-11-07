import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { brand } from "../lib/config";
import { GhostButton, styles } from "./ui";

/**
 * QR scanner for handover verification (Mobile Phase 2).
 *
 * Uses expo-camera's CameraView with QR-only barcode scanning. The
 * scanned value is handed back verbatim — the server extracts the
 * token and compares it, so the app never "trusts" a scan locally.
 * Permission denial is a first-class state: the caller keeps the
 * paste/type fallback in front of the user, and this component just
 * explains why the camera is off.
 */
export default function QrScanner({
  onScanned,
  onClose,
}: {
  onScanned: (value: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const handledRef = useRef(false);

  if (!permission) {
    return (
      <View style={local.frame}>
        <Text style={styles.muted}>Checking camera permission…</Text>
        <GhostButton label="Close scanner" onPress={onClose} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={local.frame}>
        <Text style={[styles.label, { textAlign: "center" }]}>Camera access is off</Text>
        <Text style={styles.muted}>
          {permission.canAskAgain
            ? "Sri Clean needs the camera to scan the order's QR tag. You can allow it now, or close this and paste / type the code instead — both work."
            : "Camera permission was denied in system settings. Paste or type the order's QR code instead — it works the same."}
        </Text>
        {permission.canAskAgain ? (
          <GhostButton label="Allow camera" onPress={() => void requestPermission()} />
        ) : null}
        <GhostButton label="Close — I'll paste the code" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={local.frame}>
      <CameraView
        style={local.camera}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={(result) => {
          if (handledRef.current || !result.data) return;
          handledRef.current = true;
          onScanned(result.data);
        }}
      />
      <Text style={styles.muted}>Point the camera at the order{"'"}s QR tag.</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() => setTorch((t) => !t)}
          style={[styles.chip, torch && styles.chipSelected]}
        >
          <Text style={[styles.chipText, torch && styles.chipTextSelected]}>
            {torch ? "Torch on" : "Torch"}
          </Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.chip}>
          <Text style={styles.chipText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  frame: {
    gap: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: brand.tealBorder,
    borderRadius: 12,
    padding: 12,
    backgroundColor: brand.tealSoft,
  },
  camera: { width: "100%", height: 260, borderRadius: 10, overflow: "hidden" },
});
