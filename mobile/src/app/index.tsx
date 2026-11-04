import { Redirect } from "expo-router";

/** The app opens on the tab shell (Home). */
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
