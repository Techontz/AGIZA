import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { ChevronRight, Scale } from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { Card, Divider, Section } from '@/components/ui/card';
import { EmptyState, ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { accountApi } from '@/lib/api/endpoints';
import { date, dateTime, money } from '@/lib/format';
import { keys } from '@/lib/query';
import { colors, radius, space, themed } from '@/theme/tokens';

/** My balance with AGIZA: what I owe on orders (pay any time), my credit with AGIZA, and the net. */
export default function BalanceScreen() {
  const q = useQuery({ queryKey: keys.balance, queryFn: accountApi.balance });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const b = q.data;
  const net = Number(b.net);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primary} />
      }>
      <Stack.Screen options={{ title: 'My balance' }} />
      <View style={styles.hero}>
        <Text variant="overline" color="rgba(255,255,255,0.72)">
          {net > 0 ? 'You owe AGIZA' : net < 0 ? 'AGIZA owes you' : 'All settled'}
        </Text>
        <Text variant="display" color={colors.onHero}>
          {money(String(Math.abs(net)), b.currency)}
        </Text>
        <View style={styles.split}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="rgba(255,255,255,0.72)">
              Unpaid on orders
            </Text>
            <Text variant="bodyMedium" color={colors.onHero}>
              {money(b.owed_by_customer, b.currency)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="rgba(255,255,255,0.72)">
              Your credit with AGIZA
            </Text>
            <Text variant="bodyMedium" color={colors.onHero}>
              {money(b.owed_to_customer, b.currency)}
            </Text>
          </View>
        </View>
      </View>

      <Section title="Orders to pay">
        {b.orders.length === 0 ? (
          <EmptyState icon={Scale} title="Nothing to pay" message="Every order is paid. Thank you!" />
        ) : (
          <Card>
            {b.orders.map((o, i) => (
              <View key={o.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${o.reference}, ${money(o.due, o.currency)} due. Pay`}
                  onPress={() =>
                    router.push({ pathname: '/order/[reference]', params: { reference: o.reference, pay: '1' } })
                  }
                  style={styles.row}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyMedium" color={colors.ink}>
                      {o.reference}
                    </Text>
                    <Text variant="small" color={colors.textMuted} numberOfLines={1}>
                      {o.item_details}
                    </Text>
                    {o.next_installment ? (
                      <Text variant="smallMedium" color={o.next_installment.overdue ? colors.danger : colors.ink}>
                        Next installment {money(o.next_installment.amount, o.currency)}{' '}
                        {o.next_installment.overdue ? 'was due' : 'due'} {date(o.next_installment.due_date)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text variant="bodyMedium" color={colors.danger}>
                      {money(o.due, o.currency)}
                    </Text>
                    <Text variant="caption" color={colors.textMuted}>
                      of {money(o.total, o.currency)}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.textSubtle} />
                </Pressable>
              </View>
            ))}
          </Card>
        )}
      </Section>

      {b.wallet_transactions.length ? (
        <Section title="Credit activity">
          <Card>
            {b.wallet_transactions.map((t, i) => (
              <View key={t.id}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.row}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyMedium" color={colors.ink}>
                      {t.source_display}
                      {t.order ? ` · ${t.order}` : ''}
                    </Text>
                    <Text variant="small" color={colors.textMuted}>
                      {dateTime(t.created_at)}
                    </Text>
                  </View>
                  <Text variant="bodyMedium" color={t.kind === 'credit' ? colors.success : colors.ink}>
                    {t.kind === 'credit' ? '+' : '−'}
                    {money(t.amount, b.currency)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = themed(() => ({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxxl },
  hero: { gap: space.xs, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.hero },
  split: { flexDirection: 'row', gap: space.lg, marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
}));
