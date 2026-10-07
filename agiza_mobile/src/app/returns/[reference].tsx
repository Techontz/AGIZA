import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Camera, MessageCircle } from 'lucide-react-native';
import { RefreshControl, ScrollView, View } from 'react-native';

import { ProductImage } from '@/components/product-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Divider, Row, Section } from '@/components/ui/card';
import { ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { returnApi } from '@/lib/api/endpoints';
import { tokenStore } from '@/lib/auth/token-store';
import { date, dateTime, money } from '@/lib/format';
import { keys } from '@/lib/query';
import { REFUND_LABEL, refundTone, returnTone } from '@/lib/returns';
import { openChatRoom, returnRoom } from '@/lib/chat';
import { colors, radius, space, themed } from '@/theme/tokens';

/** Evidence photos are private: they load with the customer's token. */
function EvidencePhotos({ urls }: { urls: string[] }) {
  const token = useQuery({ queryKey: ['access-token'], queryFn: tokenStore.getAccess, staleTime: 60_000 });
  if (!token.data) return null;
  return (
    <View style={styles.photos}>
      {urls.map((uri, i) => (
        <Image
          key={uri}
          source={{ uri, headers: { Authorization: `Bearer ${token.data}` } }}
          style={styles.photo}
          contentFit="cover"
          transition={150}
          accessibilityLabel={`Photo ${i + 1} of ${urls.length}`}
        />
      ))}
    </View>
  );
}

/** One return request: where it is, what AGIZA said and what happens to the money. */
export default function ReturnScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const ret = useQuery({ queryKey: keys.returnDetail(reference), queryFn: () => returnApi.get(reference) });

  if (ret.isLoading) return <Loading />;
  if (ret.isError || !ret.data) return <ErrorState error={ret.error} onRetry={() => ret.refetch()} />;
  const r = ret.data;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={ret.isRefetching} onRefresh={() => ret.refetch()} tintColor={colors.primary} />}>
      <Stack.Screen options={{ title: r.reference }} />

      <Card style={styles.head}>
        <View style={styles.headRow}>
          <Text variant="small" color={colors.textMuted}>
            Return · {date(r.created_at)}
          </Text>
          <Badge label={r.status_display} tone={returnTone(r.status_display)} />
        </View>
        <Text variant="subheading" color={colors.ink}>
          {r.items}
        </Text>
        <Text variant="small" color={colors.textMuted}>
          {r.reason}
        </Text>
      </Card>

      {r.message ? (
        <Section title="Message from AGIZA">
          <Card>
            <Text variant="body" color={colors.text}>
              {r.message}
            </Text>
          </Card>
        </Section>
      ) : null}

      <Section title="Refund">
        <Card>
          <Row label="Value of items" value={money(r.value)} />
          {r.refund_amount ? <Row label="Refund" value={money(r.refund_amount)} strong /> : null}
          <View style={styles.badgeRow}>
            <Badge label={REFUND_LABEL[r.refund_status]} tone={refundTone(r.refund_status)} />
          </View>
        </Card>
      </Section>

      {r.lines.length ? (
        <Section title="Items">
          <Card>
            {r.lines.map((line, i) => (
              <View key={`${line.name}-${i}`}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.item}>
                  <ProductImage uri={line.image} size={48} />
                  <View style={styles.flex}>
                    <Text variant="bodyMedium" color={colors.ink} numberOfLines={2}>
                      {line.name}
                      {line.variant_name ? ` · ${line.variant_name}` : ''}
                    </Text>
                    <Text variant="small" color={colors.textMuted}>
                      Quantity {line.quantity}
                    </Text>
                  </View>
                  <Text variant="bodyMedium" color={colors.ink}>
                    {money(line.amount)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {r.explanation ? (
        <Section title="What you told us">
          <Card>
            <Text variant="body" color={colors.text}>
              {r.explanation}
            </Text>
          </Card>
        </Section>
      ) : null}

      {r.evidence.length || r.can_add_evidence ? (
        <Section title="Photos">
          <Card style={styles.gap}>
            {r.evidence.length ? <EvidencePhotos urls={r.evidence} /> : null}
            {r.can_add_evidence ? (
              <View style={styles.hint}>
                <Camera size={18} color={colors.textMuted} />
                <Text variant="small" color={colors.textMuted} style={styles.flex}>
                  To add photos of the items, open this return on the AGIZA website (Account → Returns), or send them to
                  AGIZA Support.
                </Text>
              </View>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {r.history.length ? (
        <Section title="History">
          <Card>
            {r.history.map((h, i) => (
              <View key={`${h.status}-${h.at}-${i}`} style={styles.history}>
                <View style={[styles.dot, i === r.history.length - 1 && styles.dotCurrent]} />
                <View style={styles.flex}>
                  <Text variant="bodyMedium" color={colors.ink}>
                    {h.status}
                  </Text>
                  <Text variant="small" color={colors.textMuted}>
                    {dateTime(h.at)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      <Button
        title={`View order ${r.order}`}
        variant="secondary"
        onPress={() => router.push({ pathname: '/order/[reference]', params: { reference: r.order } })}
      />
      <Button
        title="Chat with AGIZA about this return"
        variant="secondary"
        icon={<MessageCircle size={18} color={colors.ink} />}
        onPress={() => openChatRoom(...returnRoom(r.reference))}
      />
    </ScrollView>
  );
}

const styles = themed(() => ({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxxl },
  head: { gap: space.xs },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  badgeRow: { flexDirection: 'row', marginTop: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  flex: { flex: 1 },
  gap: { gap: space.md },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photo: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.background },
  hint: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  history: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: space.xs },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.borderStrong, marginTop: 6 },
  dotCurrent: { backgroundColor: colors.brand },
}));
