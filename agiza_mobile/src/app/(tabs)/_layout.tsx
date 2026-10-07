import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardList, FileText, House, MessageCircle, UserRound, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { CartButton } from '@/components/cart-button';
import { colors, fonts, radius, shadow } from '@/theme/tokens';

function TabIcon({ icon: Icon, color, focused }: { icon: LucideIcon; color: ColorValue; focused: boolean }) {
  return (
    <View style={[styles.icon, focused && { backgroundColor: colors.brand }]}>
      <Icon color={focused ? colors.onPrimary : (color as string)} size={22} strokeWidth={focused ? 2.2 : 1.8} />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 52, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});

export default function TabLayout() {
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        // White bar; the active tab is ink on an AGIZA-yellow pill.
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11.5, marginTop: 4 },
        tabBarIconStyle: { marginTop: 6 },
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          height: 70 + bottom,
          paddingBottom: bottom,
          ...shadow.float,
        },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 18 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Agiza', headerShown: false, tabBarIcon: ({ color, focused }) => <TabIcon icon={House} color={color} focused={focused} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: 'Orders', tabBarIcon: ({ color, focused }) => <TabIcon icon={FileText} color={color} focused={focused} /> }}
      />
      <Tabs.Screen
        name="quotations"
        options={{ title: 'Quotations', tabBarIcon: ({ color, focused }) => <TabIcon icon={ClipboardList} color={color} focused={focused} /> }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: 'Chat', headerTitle: 'Chats', tabBarIcon: ({ color, focused }) => <TabIcon icon={MessageCircle} color={color} focused={focused} /> }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Profile', tabBarIcon: ({ color, focused }) => <TabIcon icon={UserRound} color={color} focused={focused} /> }}
      />
      {/* Not in the bar: Shop opens from Home, Cart from the Shop header and product pages. */}
      <Tabs.Screen name="shop" options={{ title: 'Shop', href: null, headerRight: () => <CartButton /> }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', href: null }} />
    </Tabs>
  );
}
