import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Package } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { OrderRow } from '@/components/order-row';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { orderApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';
import { colors, radius, space } from '@/theme/tokens';

const TABS = [
  { value: 'active', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export default function OrdersScreen() {
  const { status } = useAuth();
  const [group, setGroup] = useState<(typeof TABS)[number]['value']>('active');
  const orders = useQuery({
    queryKey: keys.orders(group),
    queryFn: () => orderApi.list(group),
    enabled: status === 'signedIn',
  });

  if (status !== 'signedIn') {
    return <SignInPrompt icon={Package} title="Your orders" message="Sign in to see and track your orders." />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Pressable
            key={t.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: group === t.value }}
            onPress={() => setGroup(t.value)}
            style={[styles.tab, group === t.value && styles.tabActive]}>
            <Text variant="smallMedium" color={group === t.value ? colors.ink : colors.textMuted}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {orders.isLoading ? (
        <Loading />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
      ) : (
        <FlatList
          data={orders.data?.results ?? []}
          keyExtractor={(o) => o.reference}
          contentContainerStyle={styles.list}
          refreshing={orders.isRefetching}
          onRefresh={() => orders.refetch()}
          renderItem={({ item }) => <OrderRow order={item} />}
          ListEmptyComponent={
            <EmptyState
              icon={Package}
              title={group === 'active' ? 'No orders in progress' : group === 'completed' ? 'No completed orders' : 'No cancelled orders'}
              message={group === 'active' ? 'Orders you place in the shop or through Buy for me appear here.' : undefined}
              action={group === 'active' ? <Button title="Go shopping" onPress={() => router.push('/shop')} /> : undefined}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    margin: space.lg,
    marginBottom: 0,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: '#ECEEF1',
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surface },
  list: { padding: space.lg, gap: space.md, flexGrow: 1 },
});
