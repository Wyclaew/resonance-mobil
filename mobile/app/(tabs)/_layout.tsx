import { Tabs } from "expo-router";

/** Masaüstü sidebar'ının karşılığı: Şu An · Ara · Kütüphane · İndirilenler.
 *  (Keşfet Faz 4'te eklenecek — öneri motoru bağlandığında.) */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#e0a33c",
        tabBarInactiveTintColor: "#8d8d93",
        tabBarStyle: { backgroundColor: "#141416", borderTopColor: "#2a2a2e" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Şu An" }} />
      <Tabs.Screen name="search" options={{ title: "Ara" }} />
      <Tabs.Screen name="library" options={{ title: "Kütüphane" }} />
      <Tabs.Screen name="downloads" options={{ title: "İndirilenler" }} />
    </Tabs>
  );
}
