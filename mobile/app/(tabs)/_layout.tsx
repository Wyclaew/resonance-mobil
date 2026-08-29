import { Link, Tabs } from "expo-router";
import { Pressable, Text } from "react-native";

/** Masaüstü sidebar'ının karşılığı: Şu An · Ara · Kütüphane · İndirilenler.
 *  (Keşfet Faz 4'te eklenecek — öneri motoru bağlandığında.)
 *  ⚠️ Hesap/senkron masaüstünde de sidebar'da DEĞİL — başlıktaki dişliden açılır. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: "#0c0c0d" },
        headerShadowVisible: false,
        headerTintColor: "#e9e7e1",
        headerTitleStyle: { fontSize: 16 },
        headerRight: () => (
          <Link href="/settings" asChild>
            <Pressable hitSlop={12} className="px-4">
              <Text className="text-muted text-lg">⚙</Text>
            </Pressable>
          </Link>
        ),
        tabBarActiveTintColor: "#e0a33c",
        tabBarInactiveTintColor: "#8d8d93",
        tabBarStyle: { backgroundColor: "#141416", borderTopColor: "#2a2a2e" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Şu An" }} />
      <Tabs.Screen name="discover" options={{ title: "Keşfet" }} />
      <Tabs.Screen name="search" options={{ title: "Ara" }} />
      <Tabs.Screen name="library" options={{ title: "Kütüphane" }} />
      <Tabs.Screen name="downloads" options={{ title: "İndirilenler" }} />
    </Tabs>
  );
}
