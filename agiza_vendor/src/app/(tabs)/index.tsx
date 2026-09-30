import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { AlertTriangle, ChevronRight, Package, PackagePlus, ShoppingCart } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScrollScreen } from '@/components/seller/scroll-screen';
import { StatTile, TileGrid } from '@/components/seller/stat-tile';
import { StoreAvatar } from '@/components/seller/store-avatar';
import { SuspendedBanner } from '@/components/seller/suspended-banner';
import { Button } from '@/components/ui/button';
import { Card, Section } from '@/components/ui/card';
import { ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { sellerApi } from '@/lib/api/endpoints';
import { money } from '@/lib/format';
import { keys } from '@/lib/query';
import { plural } from '@/lib/seller';
import { colors, radius, space } from '@/theme/tokens';

export default function DashboardScreen() {
  const data = useQuery({ queryKey: keys.dashboard, queryFn: sellerApi.dashboard });
  if (data.isLoading) return <Loading />;
  if (data.isError || !data.data) return <ErrorState error={data.error} onRetry={() => data.refetch()} />;
  const d = data.data;
  const e = d.earnings;
  const payable = Number(e.payable);
  const counts: [string, number][] = [
    ['Live', d.products.published],
    ['Waiting for review', d.products.pending_review],
    ['Drafts', d.products.draft],
    ['Changes needed', d.products.rejected],
    ['Hidden', d.products.inactive],
    ['Disabled by AGIZA', d.products.disabled],
  ];

  return (
    <ScrollScreen refreshing={data.isRefetching} onRefresh={() => data.refetch()}>
      <SuspendedBanner />
      <View style={styles.hello}>
        <StoreAvatar name={d.store.name} logo={d.store.logo} size={52} />
        <View style={styles.flex}>
          <Text variant="title" color={colors.ink}>
            Karibu, {d.store.contact_person.split(' ')[0] || d.store.name}
          </Text>
          <Text variant="small" color={colors.textMuted}>
            {d.store.name} · Commission {d.store.commission}
          </Text>
          <Text variant="small" color={colors.textMuted}>
            {d.store.payout_schedule}
          </Text>
        </View>
      </View>
      {d.store.can_sell ? (
        <Button title="Add product" icon={<PackagePlus size={18} color="#FFFFFF" />} onPress={() => router.push('/products/new')} />
      ) : null}
      {d.orders_to_prepare ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${plural(d.orders_to_prepare, 'order')} to prepare. Open orders`}
          onPress={() => router.navigate('/orders')}
          style={({ pressed }) => [styles.alert, pressed && { opacity: 0.85 }]}>
          <ShoppingCart size={20} color={colors.primary} />
          <Text variant="subheading" color={colors.primary} style={styles.flex}>
            {plural(d.orders_to_prepare, 'order')} to prepare
          </Text>
          <ChevronRight size={20} color={colors.primary} />
        </Pressable>
      ) : null}
      <TileGrid>
        <StatTile label="Gross sales" value={money(e.gross_sales)} />
        <StatTile label="AGIZA commission" value={money(e.commission)} />
        <StatTile label="Your earnings" value={money(e.net_earnings)} strong />
        {payable < 0 ? (
          <StatTile label="To be deducted" value={money(Math.abs(payable))} hint="Taken from your next earnings" />
        ) : (
          <StatTile label="Payable now" value={money(e.payable)} hint={`Paid out: ${money(e.paid_out)}`} />
        )}
      </TileGrid>
      <Section
        title="Products"
        action={
          <Pressable accessibilityRole="link" onPress={() => router.navigate('/products')} hitSlop={8} style={styles.link}>
            <Text variant="smallMedium" color={colors.primary}>
              Manage
            </Text>
          </Pressable>
        }>
        <Card style={styles.card}>
          <View style={styles.counts}>
            {counts.map(([label, n]) => (
              <View key={label} style={styles.count} accessible accessibilityLabel={`${label}: ${n}`}>
                <Text variant="small" color={colors.textMuted}>
                  {label}
                </Text>
                <Text variant="heading" color={colors.ink}>
                  {n}
                </Text>
              </View>
            ))}
          </View>
          {d.low_stock ? (
            <View style={styles.note}>
              <AlertTriangle size={16} color={colors.warning} />
              <Text variant="small" color={colors.warning} style={styles.flex}>
                {d.low_stock} item{d.low_stock === 1 ? ' is' : 's are'} low on stock (3 or fewer).
              </Text>
            </View>
          ) : null}
          {!Object.values(d.products).some(Boolean) ? (
            <View style={styles.note}>
              <Package size={16} color={colors.textMuted} />
              <Text variant="small" color={colors.textMuted} style={styles.flex}>
                Add your first product to start selling.
              </Text>
            </View>
          ) : null}
        </Card>
      </Section>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  hello: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  card: { gap: space.md },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  count: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.background, borderRadius: radius.md, padding: space.md },
  note: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs },
});
