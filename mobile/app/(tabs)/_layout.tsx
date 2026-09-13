import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "../../src/components/Icon";
import { TAB_BAR_HEIGHT } from "../../src/components/MiniPlayer";
import { hapticSelect } from "../../src/lib/haptics";
import { useT } from "../../src/lib/i18n.mobile";
import { useColors } from "../../src/theme";

/**
 * Sekmeler: Ana sayfa · Keşfet · Ara · Kütüphane (masaüstü kenar çubuğunun
 * sırası). "Şu an" artık sekme değil: mini oynatıcı her ekranda altta durur ve
 * tam ekran oynatıcıyı açar — müzik uygulamalarının alışılmış düzeni.
 * İndirilenler Kütüphane'nin içinde (masaüstünde de öyle).
 */
export default function TabsLayout() {
  const c = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const icon =
    (name: IconName) =>
    ({ focused }: { focused: boolean }) => (
      <View className="items-center">
        <Icon name={name} size={22} color={focused ? c.accent : c.faint} strokeWidth={focused ? 2.2 : 1.8} />
      </View>
    );

  return (
    <Tabs
      screenListeners={{ tabPress: () => hapticSelect() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.faint,
        sceneStyle: { backgroundColor: c.bg },
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.border,
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
          elevation: 0,
        },
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 10.5, marginTop: 1 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("m.tab.home"), tabBarIcon: icon("home") }} />
      <Tabs.Screen name="discover" options={{ title: t("m.tab.discover"), tabBarIcon: icon("compass") }} />
      <Tabs.Screen name="search" options={{ title: t("m.tab.search"), tabBarIcon: icon("search") }} />
      <Tabs.Screen name="library" options={{ title: t("m.tab.library"), tabBarIcon: icon("library") }} />
    </Tabs>
  );
}
