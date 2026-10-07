import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  useFonts,
} from '@expo-google-fonts/outfit';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useNotificationAlerts } from '@/hooks/use-notification-alerts';
import { AuthProvider, useAuth } from '@/lib/auth/session';
import { queryClient } from '@/lib/query';
import { applyScheme, colors, fonts, scheme } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

const navigationTheme = () => {
  const base = scheme() === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.ink,
      border: colors.border,
    },
  };
};

function RootStack() {
  const { status } = useAuth();
  const [fontsLoaded] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold });
  const ready = fontsLoaded && status !== 'loading';
  useNotificationAlerts(status === 'signedIn');

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const signedIn = status === 'signedIn';
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 18 },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: '' }} />
      <Stack.Screen name="products" options={{ title: 'Products' }} />
      <Stack.Screen name="stores" options={{ title: 'Stores' }} />
      <Stack.Screen name="store/[slug]" options={{ title: '' }} />
      <Stack.Screen name="reviews/[productId]" options={{ title: 'Reviews' }} />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ title: 'Sign in', presentation: 'modal' }} />
        <Stack.Screen name="register" options={{ title: 'Create account', presentation: 'modal' }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Reset password', presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
        <Stack.Screen name="order/[reference]" options={{ title: 'Order' }} />
        <Stack.Screen name="addresses/index" options={{ title: 'Delivery addresses' }} />
        <Stack.Screen name="addresses/edit" options={{ title: 'Address', presentation: 'modal' }} />
        <Stack.Screen name="chat-room" options={{ title: 'AGIZA Support' }} />
        <Stack.Screen name="shipping-addresses" options={{ title: 'AGIZA shipping addresses' }} />
        <Stack.Screen name="requests/new" options={{ title: 'New request', presentation: 'modal' }} />
        <Stack.Screen name="requests/[id]" options={{ title: 'Request' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
        <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
        <Stack.Screen name="reviews/write" options={{ title: 'Write a review', presentation: 'modal' }} />
        <Stack.Screen name="my-reviews" options={{ title: 'My reviews' }} />
        <Stack.Screen name="saved" options={{ title: 'Saved products' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="returns/index" options={{ title: 'My returns' }} />
        <Stack.Screen name="returns/new" options={{ title: 'Return items' }} />
        <Stack.Screen name="returns/[reference]" options={{ title: 'Return' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Light or dark follows the phone. When it changes, the palette switches and the screens are
  // drawn again with the new colours (sign-in, cart and cached data are kept).
  // applyScheme only changes anything when the phone's setting changes, so calling it here is safe.
  applyScheme(useColorScheme());
  const dark = scheme() === 'dark';

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider value={navigationTheme()}>
            <StatusBar style={dark ? 'light' : 'dark'} />
            <RootStack key={scheme()} />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
