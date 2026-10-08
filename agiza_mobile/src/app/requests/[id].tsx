import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { Alert, ScrollView, View } from 'react-native';

import { PrivatePhotos } from '@/components/private-photos';
import { QuoteItems } from '@/components/quote-items';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Row, Section } from '@/components/ui/card';
import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { requestApi } from '@/lib/api/endpoints';
import type { Paginated, QuoteRequest } from '@/lib/api/types';
import { date, dateTime, money } from '@/lib/format';
import { keys } from '@/lib/query';
import { QUOTE_TONE, requestKind, requestTitle } from '@/lib/requests';
import { openChatRoom, orderRoom, quoteRoom } from '@/lib/chat';
import { colors, space, themed } from '@/theme/tokens';

const NEXT_STEP: Record<string, string> = {
  new: 'AGIZA is preparing your quotation. You will be notified when it is ready.',
  waiting_reply: 'Your quotation is ready. Accept it to go ahead, or decline.',
  answered: 'You accepted. AGIZA is confirming your order.',
  declined: 'You declined this quotation. AGIZA may send an updated one.',
  approved: 'Your order is confirmed. Track and pay for it from Orders.',
  cancelled: 'This request was cancelled.',
};

export default function RequestScreen() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const quoteId = Number(id);
  const queryClient = useQueryClient();
  const quote = useQuery({
    queryKey: keys.request(quoteId),
    queryFn: () => requestApi.get(quoteId),
    // Open with what the Quotations list already has; details refresh in the background.
    placeholderData: () =>
      queryClient.getQueryData<Paginated<QuoteRequest>>(keys.requests)?.results.find((q) => q.id === quoteId),
  });
  const reply = useMutation({
    mutationFn: (accept: boolean) => (accept ? requestApi.accept(quoteId) : requestApi.decline(quoteId)),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.request(quoteId), updated);
      queryClient.invalidateQueries({ queryKey: keys.requests });
    },
  });

  if (quote.isLoading) return <Loading />;
  if (quote.isError || !quote.data) return <ErrorState error={quote.error} onRetry={() => quote.refetch()} />;
  const q = quote.data;
  // A multi-item quotation lists its items above; its description would only repeat them.
  const details = q.items?.length
    ? []
    : q.description.split('\n').slice(1).filter((l) => l !== 'Submitted in the AGIZA app');
  const photos = q.photos ?? [];
  const agizaPhotos = photos.filter((p) => p.from === 'agiza').map((p) => p.url);
  // Photos of a particular item show with that item, not again under "Your request".
  const itemPhotoIds = new Set((q.items ?? []).flatMap((it) => it.photo_ids));
  const myPhotos = photos.filter((p) => p.from !== 'agiza' && !itemPhotoIds.has(p.id)).map((p) => p.url);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: q.reference }} />
      {created ? <Notice tone="success">Request sent. AGIZA will send you a quotation soon.</Notice> : null}
      <Card style={{ gap: space.sm }}>
        <Text variant="small" color={colors.textMuted}>
          {requestKind(q)} · {date(q.requested_at)}
        </Text>
        <Text variant="heading" color={colors.ink}>
          {requestTitle(q)}
        </Text>
        <Badge label={q.status_display} tone={QUOTE_TONE[q.status]} />
        <Text variant="body" color={colors.text}>
          {NEXT_STEP[q.status]}
        </Text>
      </Card>

      {q.quoted_amount ? (
        <Section title="Quotation">
          <Card>
            <Row label="Total price" value={money(q.quoted_amount, q.currency)} strong />
            {q.estimated_delivery ? <Row label="Expected delivery" value={date(q.estimated_delivery)} /> : null}
            {q.responded_at ? <Row label="Quoted" value={dateTime(q.responded_at)} /> : null}
            {q.response_notes ? (
              <Text variant="small" color={colors.textMuted} style={{ marginTop: space.sm }}>
                {q.response_notes}
              </Text>
            ) : null}
            {agizaPhotos.length ? (
              <View style={styles.photos}>
                <Text variant="smallMedium" color={colors.ink}>
                  Photos from AGIZA
                </Text>
                <PrivatePhotos urls={agizaPhotos} label="Photo from AGIZA" />
              </View>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {q.items?.length ? (
        <Section title={`Items (${q.items.length})`}>
          <Card>
            <QuoteItems quote={q} />
          </Card>
        </Section>
      ) : null}

      <Section title="Your request">
        <Card>
          <Row label="From" value={q.origin} />
          <Row label="Deliver to" value={q.destination} />
          {details.map((line) => (
            <Text key={line} variant="small" color={colors.textMuted}>
              {line}
            </Text>
          ))}
          {myPhotos.length ? (
            <View style={styles.photos}>
              <PrivatePhotos urls={myPhotos} label="Your photo" />
            </View>
          ) : null}
        </Card>
      </Section>

      {reply.isError ? <Notice tone="danger">{errorMessage(reply.error)}</Notice> : null}
      {q.can_reply ? (
        <View style={styles.actions}>
          <Button title={`Accept ${money(q.quoted_amount, q.currency)}`} onPress={() => reply.mutate(true)} loading={reply.isPending && reply.variables} />
          <Button
            title="Decline"
            variant="secondary"
            loading={reply.isPending && !reply.variables}
            onPress={() =>
              Alert.alert('Decline this quotation?', 'AGIZA may send you a new price.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Decline', style: 'destructive', onPress: () => reply.mutate(false) },
              ])
            }
          />
        </View>
      ) : null}
      {/* Once approved, the quotation's chat continues as its order's chat (one conversation). */}
      <Button
        title={q.order ? `Chat with AGIZA about order ${q.order}` : 'Chat with AGIZA about this quotation'}
        variant="secondary"
        icon={<MessageCircle size={18} color={colors.ink} />}
        onPress={() => {
          const [room, title] = q.order ? orderRoom(q.order) : quoteRoom(q.id, q.reference);
          openChatRoom(room, title);
        }}
      />
      {q.order ? (
        <Button title={`View order ${q.order}`} onPress={() => router.push({ pathname: '/order/[reference]', params: { reference: q.order! } })} />
      ) : null}
    </ScrollView>
  );
}

const styles = themed(() => ({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxxl },
  actions: { gap: space.sm },
  photos: { marginTop: space.md, gap: space.sm },
}));
