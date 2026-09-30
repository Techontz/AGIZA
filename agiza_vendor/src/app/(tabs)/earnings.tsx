import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ScrollScreen } from '@/components/seller/scroll-screen';
import { StatTile, TileGrid } from '@/components/seller/stat-tile';
import { SuspendedBanner } from '@/components/seller/suspended-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Divider, Row, Section } from '@/components/ui/card';
import { ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { sellerApi } from '@/lib/api/endpoints';
import { date, money } from '@/lib/format';
import { keys } from '@/lib/query';
import { PAYOUT_TONE, plural } from '@/lib/seller';
import { colors, space } from '@/theme/tokens';

export default function EarningsScreen() {
  const data = useQuery({ queryKey: keys.earnings, queryFn: sellerApi.earnings });
  if (data.isLoading) return <Loading />;
  if (data.isError || !data.data) return <ErrorState error={data.error} onRetry={() => data.refetch()} />;
  const { summary: s, payouts, payout_account: acc, payout_schedule, ledger } = data.data;
  const payable = Number(s.payable);

  return (
    <ScrollScreen refreshing={data.isRefetching} onRefresh={() => data.refetch()}>
      <SuspendedBanner />
      <Text variant="small" color={colors.textMuted}>
        Earnings become payable when an order is delivered and fully paid. {payout_schedule}
      </Text>
      <TileGrid>
        <StatTile label="Pending" value={money(s.pending)} hint="Orders not yet delivered and paid" />
        {payable < 0 ? (
          <StatTile label="To be deducted" value={money(Math.abs(payable))} hint="Refunds after you were paid; taken from your next earnings" />
        ) : (
          <StatTile label="Payable" value={money(s.payable)} hint="AGIZA will pay this out" strong />
        )}
        <StatTile label="In a payout" value={money(s.in_payout ?? '0')} hint="Being paid now" />
        <StatTile label="Paid out" value={money(s.paid_out)} />
      </TileGrid>

      <Section title="All time">
        <Card>
          <Row label={`Gross sales (${plural(s.orders, 'order')})`} value={money(s.gross_sales)} />
          <Row label="AGIZA commission" value={`− ${money(s.commission)}`} />
          <Divider />
          <Row label="Your earnings" value={money(s.net_earnings)} strong />
          {Number(s.refunds ?? 0) ? <Row label="Customer refunds deducted" value={money(s.refunds ?? '0')} /> : null}
          {Number(s.adjustments ?? 0) ? <Row label="Adjustments" value={money(s.adjustments ?? '0')} /> : null}
        </Card>
      </Section>

      <Section title="Payout account">
        <Card style={styles.gap}>
          {acc.method ? (
            <View>
              <Row label="Method" value={acc.method} />
              <Row label={acc.method === 'Bank transfer' ? 'Bank' : 'Network'} value={acc.provider || '—'} />
              <Row label="Account name" value={acc.account_name || '—'} />
              <Row label="Account" value={acc.account_number || '—'} />
            </View>
          ) : (
            <Text variant="body" color={colors.textMuted}>
              Add your payout details in Store settings so AGIZA can pay you.
            </Text>
          )}
          <Button title="Change payout account" variant="secondary" onPress={() => router.push('/store-settings')} />
        </Card>
      </Section>

      <Section title="Payouts">
        <Card>
          {payouts.length ? (
            payouts.map((p, i) => (
              <View key={p.reference}>
                {i ? <Divider /> : null}
                <View style={styles.line}>
                  <View style={styles.flex}>
                    <View style={styles.titleRow}>
                      <Text variant="bodyMedium" color={colors.ink}>
                        {p.reference}
                      </Text>
                      <Badge label={p.status_display} tone={PAYOUT_TONE[p.status] ?? 'neutral'} />
                    </View>
                    <Text variant="small" color={colors.textMuted}>
                      {date(p.paid_at ?? p.created_at)} · {p.method}
                      {p.transaction_reference ? ` · ${p.transaction_reference}` : ''} · {plural(p.orders, 'order')}
                    </Text>
                    {Number(p.refund_deductions) || Number(p.adjustments) ? (
                      <Text variant="caption" color={colors.textMuted}>
                        Sales {money(p.gross_sales)} − commission {money(p.commission)}
                        {Number(p.refund_deductions) ? ` − refunds ${money(p.refund_deductions)}` : ''}
                        {Number(p.adjustments) ? ` · adjustments ${money(p.adjustments)}` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="subheading" color={p.status === 'paid' ? colors.ink : colors.textMuted}>
                    {money(p.amount)}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text variant="body" color={colors.textMuted}>
              No payouts yet.
            </Text>
          )}
        </Card>
      </Section>

      <Section title="Statement">
        <Text variant="small" color={colors.textMuted}>
          Every change to your balance, newest first. Entries are never edited; corrections appear as new lines.
        </Text>
        <Card>
          {ledger.length ? (
            ledger.map((e, n) => (
              <View key={n}>
                {n ? <Divider /> : null}
                <View style={styles.line} accessible accessibilityLabel={`${e.kind_display}, ${money(e.amount)}, ${date(e.at)}`}>
                  <View style={styles.flex}>
                    <Text variant="bodyMedium" color={colors.ink}>
                      {e.kind_display}
                    </Text>
                    <Text variant="small" color={colors.textMuted}>
                      {[date(e.at), e.reference, e.note].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text variant="bodyMedium" color={Number(e.amount) < 0 ? colors.danger : colors.ink}>
                    {money(e.amount)}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text variant="body" color={colors.textMuted}>
              Nothing yet.
            </Text>
          )}
        </Card>
      </Section>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  line: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: 2 },
  flex: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
});
