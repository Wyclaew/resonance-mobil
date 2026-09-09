import { Link, Tabs } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { COLORS } from "../../src/theme";

/**
 * Sekmeler: Şu An · Keşfet · Ara · Kütüphane · İndirilenler.
 * ⚠️ Ayarlar/Hesap sekmede DEĞİL — masaüstünde de sidebar'da değil, dişliden
 * açılır. Sekme çubuğu ikon kullanmaz: beş kısa etiket tek genişlikli yazıyla
 * zaten okunuyor, ikon eklemek gürültü olurdu. Etkin sekmeyi üstteki kehribar
 * çizgi söyler.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.bg },
        headerShadowVisible: false,
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontFamily: "Archivo_700Bold", fontSize: 17 },
        headerRight: () => (
          <Link href="/settings" asChild>
            <Pressable hitSlop={14} className="px-4">
              <Text className="text-muted text-lg">⚙</Text>
            </Pressable>
          </Link>
        ),
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.faint,
        tabBarStyle: {
          backgroundColor: COLORS.bg,
          borderTopColor: COLORS.border,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarIcon: ({ focused }) => (
          <View
            style={{
              height: 2,
              width: 18,
              borderRadius: 2,
              backgroundColor: focused ? COLORS.accent : "transparent",
            }}
          />
        ),
        tabBarIconStyle: { height: 2, marginBottom: 6 },
        tabBarLabelStyle: {
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 9,
          letterSpacing: 0.8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "ŞU AN",
          // Kapak görseli başlığın altına aksın — ekran afiş gibi dursun.
          headerTransparent: true,
          headerTitle: "",
        }}
      />
      <Tabs.Screen name="discover" options={{ title: "KEŞFET", headerTitle: "Keşfet" }} />
      <Tabs.Screen name="search" options={{ title: "ARA", headerTitle: "Ara" }} />
      <Tabs.Screen name="library" options={{ title: "KÜTÜPHANE", headerTitle: "Kütüphane" }} />
      <Tabs.Screen
        name="downloads"
        options={{ title: "İNDİRİLEN", headerTitle: "İndirilenler" }}
      />
    </Tabs>
  );
}
