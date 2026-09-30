import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { FormScreen } from '@/components/form-screen';
import { PrivateImage } from '@/components/seller/private-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Divider, Row, Section } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useStore } from '@/hooks/use-store';
import { sellerApi } from '@/lib/api/endpoints';
import { dateTime, money } from '@/lib/format';
import { keys } from '@/lib/query';
import { REFUND_LABEL, returnTone } from '@/lib/seller';
import { toast } from '@/lib/toast';
import { colors, radius, space } from '@/theme/tokens';

export default function ReturnScreen() {
  const reference = String(useLocalSearchParams<{ reference: string }>().reference);
  const client = useQueryClient();
  const { suspended } = useStore();
  const ret = useQuery({ queryKey: keys.returnDetail(reference), queryFn: () => sellerApi.return(reference) });
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const respond = useMutation({
    mutationFn: () => sellerApi.respond(reference, message.trim()),
    onSuccess: (r) => {
      client.setQueryData(keys.returnDetail(reference), r);
      client.invalidateQueries({ queryKey: keys.returns });
      setMessage('');
      toast('Sent to AGIZA');
    },
  });

  if (ret.isLoading) return <Loading />;
  if (ret.isError || !ret.data) return <ErrorState error={ret.error} onRetry={() => ret.refetch()} />;
  const r = ret.data;

  return (
    <FormScreen>
      <Stack.Screen options={{ title: `Return ${r.reference}` }} />
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="title" color={colors.ink}>
            {r.reference}
          </Text>
          <Text variant="small" color={colors.textMuted}>
            Order {r.order_reference} · {dateTime(r.created_at)}
          </Text>
        </View>
        <Badge label={r.status_display} tone={returnTone(r)} />
      </View>

      <Section title="Your items in this return">
        <Card>
          {r.items.map((i, n) => (
            <View key={n}>
              {n ? <Divider /> : null}
              <View style={styles.line}>
                <View style={styles.flex}>
                  <Text variant="bodyMedium" color={colors.ink}>
                    {i.quantity} × {i.name}
                  </Text>
                  {i.variant_name ? (
                    <Text variant="small" color={colors.textMuted}>
                      {i.variant_name}
                    </Text>
                  ) : null}
                </View>
                <Text variant="bodyMedium" color={colors.ink}>
                  {money(i.amount)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Customer's reason">
        <Card style={styles.gap}>
          <Text variant="bodyMedium" color={colors.ink}>
            {r.reason}
          </Text>
          {r.explanation ? (
            <Text variant="body" color={colors.text}>
              {r.explanation}
            </Text>
          ) : null}
          {r.evidence?.length ? (
            <>
              <Text variant="smallMedium" color={colors.textMuted}>
                Photos from the customer
              </Text>
              <View style={styles.photos}>
                {r.evidence.map((src, n) => (
                  <Pressable key={src} accessibilityRole="imagebutton" accessibilityLabel={`Open photo ${n + 1} from the customer`} onPress={() => setPhoto(src)}>
                    <PrivateImage uri={src} style={styles.photo} />
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </Card>
      </Section>

      <Section title="Refund">
        <Card style={styles.gap}>
          <Row label="Status" value={REFUND_LABEL[r.refund_status] ?? r.refund_status} />
          <Text variant="small" color={colors.textMuted}>
            AGIZA decides refunds. If a refund is made after you were paid for these items, it is deducted from your next payout and shown in Earnings.
          </Text>
        </Card>
      </Section>

      <Section title="Your response">
        <Card style={styles.gap}>
          {r.responses?.map((m, n) => (
            <View key={n} style={styles.response}>
              <Text variant="body" color={colors.text}>
                {m.message}
              </Text>
              <Text variant="caption" color={colors.textMuted}>
                {dateTime(m.at)}
              </Text>
            </View>
          ))}
          {r.can_respond && !suspended ? (
            <>
              {respond.isError ? <Notice tone="danger">{errorMessage(respond.error)}</Notice> : null}
              <Input
                label="Message to AGIZA"
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={2000}
                placeholder="e.g. the item was tested before dispatch, serial number…"
              />
              <Button title="Send" onPress={() => respond.mutate()} loading={respond.isPending} disabled={message.trim().length < 2} />
            </>
          ) : (
            <Text variant="small" color={colors.textMuted}>
              {r.can_respond ? 'Your store is suspended, so you cannot respond.' : 'This return is closed.'}
            </Text>
          )}
        </Card>
      </Section>

      <Modal visible={!!photo} animationType="fade" onRequestClose={() => setPhoto(null)}>
        <SafeAreaView style={styles.viewer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={() => setPhoto(null)} style={styles.close}>
            <X size={24} color="#FFFFFF" />
          </Pressable>
          {photo ? <PrivateImage uri={photo} style={styles.full} contentFit="contain" /> : null}
        </SafeAreaView>
      </Modal>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  flex: { flex: 1 },
  gap: { gap: space.md },
  line: { flexDirection: 'row', gap: space.md },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photo: { width: 88, height: 88, borderRadius: radius.md },
  response: { backgroundColor: colors.background, borderRadius: radius.md, padding: space.md, gap: 4 },
  viewer: { flex: 1, backgroundColor: '#000000' },
  close: { alignSelf: 'flex-end', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  full: { flex: 1, width: '100%' },
});
