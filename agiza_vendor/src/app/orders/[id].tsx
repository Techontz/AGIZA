import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Check, PackageCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Picker } from '@/components/picker';
import { TextButton } from '@/components/seller/application-form';
import { ScrollScreen } from '@/components/seller/scroll-screen';
import { SuspendedBanner } from '@/components/seller/suspended-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Divider, Row, Section } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useStore } from '@/hooks/use-store';
import { sellerApi } from '@/lib/api/endpoints';
import type { SellerOrder } from '@/lib/api/types';
import { dateTime, money } from '@/lib/format';
import { keys } from '@/lib/query';
import { fulfilmentTone, ISSUE_TYPES, settlementTone } from '@/lib/seller';
import { toast } from '@/lib/toast';
import { colors, space } from '@/theme/tokens';

export default function OrderScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const client = useQueryClient();
  const { suspended } = useStore();
  const order = useQuery({ queryKey: keys.order(id), queryFn: () => sellerApi.order(id), enabled: Number.isFinite(id) });
  const act = useMutation({
    mutationFn: (action: 'accept' | 'ready') => sellerApi.orderAction(id, action),
    onSuccess: (o) => {
      client.setQueryData(keys.order(id), o);
      client.invalidateQueries({ queryKey: keys.allOrders });
      client.invalidateQueries({ queryKey: keys.dashboard });
      toast(o.status === 'ready' ? 'Marked ready. AGIZA will collect it.' : 'Order accepted');
    },
    onError: (e) => Alert.alert("Couldn't update the order", errorMessage(e)),
  });

  if (order.isLoading) return <Loading />;
  if (order.isError || !order.data) return <ErrorState error={order.error} onRetry={() => order.refetch()} />;
  const o = order.data;

  const confirm = (action: 'accept' | 'ready') =>
    Alert.alert(
      action === 'accept' ? 'Accept this order?' : 'Items ready for pickup?',
      action === 'accept' ? 'You confirm you can supply these items and will start preparing them.' : 'AGIZA will come to collect the packed items.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: action === 'accept' ? 'Accept order' : 'Mark ready', onPress: () => act.mutate(action) },
      ],
    );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: `Order ${o.order_reference}` }} />
      <ScrollScreen refreshing={order.isRefetching} onRefresh={() => order.refetch()}>
        <SuspendedBanner />
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text variant="title" color={colors.ink}>
              {o.order_reference}
            </Text>
            <Text variant="small" color={colors.textMuted}>
              For {o.customer}
              {o.delivery_city ? ` in ${o.delivery_city}` : ''} · {dateTime(o.created_at)}
            </Text>
          </View>
          <Badge label={o.status_display} tone={fulfilmentTone(o.status)} />
        </View>

        {(o.can_accept || o.can_mark_ready) && !suspended ? (
          <Card style={styles.action}>
            <Text variant="body" color={colors.ink}>
              {o.can_accept ? 'Accept the order and start preparing the items.' : 'When the items are packed, mark them ready so AGIZA can collect them.'}
            </Text>
            {o.can_accept ? (
              <Button title="Accept order" icon={<Check size={18} color="#FFFFFF" />} loading={act.isPending} onPress={() => confirm('accept')} />
            ) : (
              <Button title="Ready for pickup" icon={<PackageCheck size={18} color="#FFFFFF" />} loading={act.isPending} onPress={() => confirm('ready')} />
            )}
          </Card>
        ) : null}

        <IssueCard order={o} disabled={suspended} />

        <Section title="Items to prepare">
          <Card>
            {o.items?.map((i, n) => (
              <View key={`${i.sku}-${n}`}>
                {n ? <Divider /> : null}
                <View style={styles.line}>
                  <View style={styles.flex}>
                    <Text variant="bodyMedium" color={colors.ink}>
                      {i.quantity} × {i.name}
                    </Text>
                    <Text variant="small" color={colors.textMuted}>
                      {i.variant_name ? `${i.variant_name} · ` : ''}SKU {i.sku} · {money(i.unit_price)} each
                    </Text>
                  </View>
                  <Text variant="bodyMedium" color={colors.ink}>
                    {money(i.line_total)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </Section>

        <Section title="Earnings">
          <Card style={styles.gap}>
            <View>
              <Row label="Sale" value={money(o.subtotal)} />
              <Row label="AGIZA commission" value={`− ${money(o.commission)}`} />
              <Divider />
              <Row label="Your earnings" value={money(o.vendor_net)} strong />
            </View>
            <Badge label={o.settlement_display} tone={settlementTone(o.settlement_status)} />
            {o.payout ? (
              <Text variant="small" color={colors.textMuted}>
                Paid in {o.payout}
              </Text>
            ) : null}
          </Card>
        </Section>

        {o.events?.length ? (
          <Section title="Timeline">
            <Card>
              {o.events.map((e, i) => (
                <View key={i} style={[styles.event, i > 0 && styles.eventBorder]}>
                  <View style={styles.dot} />
                  <View style={styles.flex}>
                    <Text variant="bodyMedium" color={colors.ink}>
                      {e.note || e.status_display}
                      {e.by_you ? ' (you)' : ''}
                    </Text>
                    <Text variant="small" color={colors.textMuted}>
                      {dateTime(e.at)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}
      </ScrollScreen>
    </KeyboardAvoidingView>
  );
}

function IssueCard({ order, disabled }: { order: SellerOrder; disabled: boolean }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const report = useMutation({
    mutationFn: () => sellerApi.reportIssue(order.id, type!, note.trim()),
    onSuccess: (o) => {
      client.setQueryData(keys.order(order.id), o);
      client.invalidateQueries({ queryKey: keys.allOrders });
      setOpen(false);
      toast('Reported. AGIZA will contact the customer and decide what happens next.');
    },
  });
  const issue = order.issue;
  if (issue) {
    return (
      <Notice tone={issue.resolved_at ? 'info' : 'warning'}>
        {issue.resolved_at ? 'Problem resolved' : 'Problem reported'}: {issue.type_display}. {issue.note}
        {issue.resolved_at
          ? ` AGIZA's decision: ${issue.resolution || 'resolved'} (${dateTime(issue.resolved_at)}).`
          : ` Reported ${dateTime(issue.reported_at)}. AGIZA is handling it; don't ship until they confirm.`}
      </Notice>
    );
  }
  if (!order.can_report_issue || disabled) return null;
  if (!open) {
    return (
      <View>
        <Text variant="small" color={colors.textMuted}>
          Can&apos;t supply something?
        </Text>
        <TextButton title="Report a problem with this order" onPress={() => setOpen(true)} />
      </View>
    );
  }
  return (
    <Card style={styles.gap}>
      <View style={styles.issueHead}>
        <AlertTriangle size={20} color={colors.warning} />
        <Text variant="heading" color={colors.ink}>
          Report a problem
        </Text>
      </View>
      <Text variant="small" color={colors.textMuted}>
        AGIZA will tell the customer and decide whether to cancel your part and refund them. Other sellers in the order aren&apos;t affected.
      </Text>
      {report.isError ? <Notice tone="danger">{errorMessage(report.error)}</Notice> : null}
      <Picker label="What's wrong?" value={type} options={ISSUE_TYPES} onChange={setType} />
      <Input
        label="Details"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={2000}
        placeholder="Which item, how many, and why"
        hint="At least 5 characters."
      />
      <Button title="Send to AGIZA" onPress={() => report.mutate()} loading={report.isPending} disabled={!type || note.trim().length < 5} />
      <Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  action: { gap: space.md, backgroundColor: colors.primarySoft },
  gap: { gap: space.md },
  line: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  event: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm },
  eventBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 7 },
  issueHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
