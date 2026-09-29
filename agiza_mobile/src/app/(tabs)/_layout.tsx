import { Tabs } from 'expo-router';
import { House, Package, ShoppingCart, Store, UserRound } from 'lucide-react-native';

import { useCart } from '@/hooks/use-cart';
import { colors, fonts } from '@/theme/tokens';

export default function TabLayout() {
  const { count } = useCart();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarStyle: { borderTopColor: colors.border },
        headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', headerShown: false, tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="shop"
        options={{ title: 'Shop', tabBarIcon: ({ color, size }) => <Store color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarBadge: count > 0 ? (count > 99 ? '99+' : count) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.brand, fontFamily: fonts.semibold, fontSize: 10 },
          tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Package color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }}
      />
    </Tabs>
  );
}
