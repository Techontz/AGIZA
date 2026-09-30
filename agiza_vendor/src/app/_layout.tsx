import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  useFonts,
} from '@expo-google-fonts/outfit';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { ErrorState, Loading } from '@/components/ui/states';
import { openNotificationTarget } from '@/hooks/use-notifications';
import { useStore } from '@/hooks/use-store';
import type { SellerNotification } from '@/lib/api/types';
import { AuthProvider, useAuth } from '@/lib/auth/session';
import { queryClient } from '@/lib/query';
import { colors, fonts, space } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.background, card: colors.surface, text: colors.ink },
};

/** Opens the order / return / reviews screen when the seller taps a push notification. */
function usePushTaps(enabled: boolean) {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const data = response.notification.request.content.data as SellerNotification['data'];
    openNotificationTarget({ data });
  }, [enabled, response]);
}

function RootStack() {
  const { status, signOut } = useAuth();
  const store = useStore();
  const [fontsLoaded] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold });
  const signedIn = status === 'signedIn';
  const ready = fontsLoaded && status !== 'loading';
  usePushTaps(signedIn && store.phase === 'seller');

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  // Signed in: which part of the app depends on the account's store, so wait for it.
  if (signedIn && store.phase === 'loading') return <Loading label="Opening your store…" />;
  if (signedIn && store.phase === 'error') {
    return (
      <SafeAreaView style={styles.gate}>
        <ErrorState error={store.error} onRetry={() => store.refetch()} />
        <View style={styles.gateFooter}>
          <Button title="Sign out" variant="ghost" onPress={signOut} />
        </View>
      </SafeAreaView>
    );
  }
  const seller = signedIn && store.phase === 'seller';

  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Protected guard={seller}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="orders/[id]" options={{ title: 'Order' }} />
        <Stack.Screen name="products/new" options={{ title: 'Add product' }} />
        <Stack.Screen name="products/[id]" options={{ title: 'Product' }} />
        <Stack.Screen name="returns/index" options={{ title: 'Returns' }} />
        <Stack.Screen name="returns/[reference]" options={{ title: 'Return' }} />
        <Stack.Screen name="reviews" options={{ title: 'Reviews' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="store-settings" options={{ title: 'Store settings' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Sign in' }} />
        <Stack.Screen name="register" options={{ title: 'Create account' }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && store.phase === 'none'}>
        <Stack.Screen name="apply" options={{ title: 'Apply to sell' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && store.phase === 'application'}>
        <Stack.Screen name="application" options={{ title: 'Your application' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
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

const styles = StyleSheet.create({
  gate: { flex: 1, backgroundColor: colors.background },
  gateFooter: { padding: space.lg },
});
