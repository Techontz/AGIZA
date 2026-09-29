import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  useFonts,
} from '@expo-google-fonts/outfit';
import { QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/lib/auth/session';
import { queryClient } from '@/lib/query';
import { colors, fonts } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.background, card: colors.surface, text: colors.ink },
};

function RootStack() {
  const { status } = useAuth();
  const [fontsLoaded] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold });
  const ready = fontsLoaded && status !== 'loading';

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const signedIn = status === 'signedIn';
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: '' }} />
      <Stack.Screen name="products" options={{ title: 'Products' }} />
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
        <Stack.Screen name="requests/index" options={{ title: 'Buy for me' }} />
        <Stack.Screen name="requests/new" options={{ title: 'New request', presentation: 'modal' }} />
        <Stack.Screen name="requests/[id]" options={{ title: 'Request' }} />
        <Stack.Screen name="support" options={{ title: 'AGIZA Support' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
        <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider value={theme}>
            <StatusBar style="dark" />
            <RootStack />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
