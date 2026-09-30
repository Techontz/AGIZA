import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag, MessageSquareReply, Star } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, RefreshControl, StyleSheet, View } from 'react-native';

import { Stars } from '@/components/rating';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useStore } from '@/hooks/use-store';
import { sellerApi } from '@/lib/api/endpoints';
import type { SellerReview } from '@/lib/api/types';
import { date } from '@/lib/format';
import { keys } from '@/lib/query';
import { plural } from '@/lib/seller';
import { toast } from '@/lib/toast';
import { colors, radius, space } from '@/theme/tokens';

export default function ReviewsScreen() {
  const { suspended } = useStore();
  const list = useInfiniteQuery({
    queryKey: keys.reviews,
    queryFn: ({ pageParam }) => sellerApi.reviews(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });
  if (list.isLoading) return <Loading />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  const items = list.data?.pages.flatMap((p) => p.results) ?? [];
  const summary = list.data?.pages[0]?.summary;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={items}
        keyExtractor={(r) => String(r.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, !items.length && styles.grow]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="small" color={colors.textMuted}>
              Reviews from customers who received your products. Reply publicly, or ask AGIZA to check a review that breaks the rules.
            </Text>
            {summary?.rating_count ? (
              <Card style={styles.summary}>
                <Text style={styles.big} color={colors.ink}>
                  {summary.rating}
                </Text>
                <View style={styles.flex}>
                  <Stars value={summary.rating} size={18} />
                  <Text variant="small" color={colors.textMuted}>
                    Store rating from {plural(summary.rating_count, 'review')}
                  </Text>
                </View>
              </Card>
            ) : null}
          </View>
        }
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => list.refetch()} colors={[colors.brand]} />}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.brand} /> : null}
        ListEmptyComponent={<EmptyState icon={Star} title="No reviews yet" message="Customers can review a product after it has been delivered to them." />}
        renderItem={({ item }) => <ReviewRow review={item} disabled={suspended} />}
      />
    </KeyboardAvoidingView>
  );
}

function ReviewRow({ review: r, disabled }: { review: SellerReview; disabled: boolean }) {
  const client = useQueryClient();
  const [mode, setMode] = useState<'reply' | 'flag' | null>(null);
  const [text, setText] = useState(r.vendor_reply ?? '');
  const act = useMutation({
    mutationFn: () => (mode === 'flag' ? sellerApi.flag(r.id, text.trim()) : sellerApi.reply(r.id, text.trim())),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.reviews });
      toast(mode === 'flag' ? 'Sent to AGIZA for review' : 'Reply published');
      setMode(null);
    },
  });
  const min = mode === 'flag' ? 5 : 2;

  return (
    <Card style={styles.review}>
      <View style={styles.titleRow}>
        <Stars value={r.rating} />
        {r.status !== 'published' ? (
          <Badge label={r.status === 'flagged' ? 'Flagged' : 'Awaiting approval'} tone={r.status === 'flagged' ? 'warning' : 'info'} />
        ) : null}
      </View>
      {r.title ? (
        <Text variant="subheading" color={colors.ink}>
          {r.title}
        </Text>
      ) : null}
      {r.body ? (
        <Text variant="body" color={colors.text}>
          {r.body}
        </Text>
      ) : null}
      <Text variant="small" color={colors.textMuted}>
        {r.author || 'Customer'} on {r.product_name} · {date(r.created_at)}
      </Text>
      {r.vendor_reply && mode !== 'reply' ? (
        <View style={styles.reply}>
          <Text variant="smallMedium" color={colors.ink}>
            Your reply
          </Text>
          <Text variant="small" color={colors.text}>
            {r.vendor_reply}
          </Text>
        </View>
      ) : null}
      {r.flag_reason ? (
        <Text variant="small" color={colors.warning}>
          You flagged this: {r.flag_reason}
        </Text>
      ) : null}
      {mode ? (
        <View style={styles.form}>
          {act.isError ? <Notice tone="danger">{errorMessage(act.error)}</Notice> : null}
          <Input
            label={mode === 'flag' ? 'Why should AGIZA check this review?' : 'Public reply'}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
            autoFocus
            hint={mode === 'flag' ? 'At least 5 characters.' : 'Customers see this under the review.'}
          />
          <View style={styles.buttons}>
            <Button
              title={mode === 'flag' ? 'Flag review' : 'Publish reply'}
              onPress={() => act.mutate()}
              loading={act.isPending}
              disabled={text.trim().length < min}
              style={styles.flex}
            />
            <Button title="Cancel" variant="secondary" onPress={() => setMode(null)} style={styles.flex} />
          </View>
        </View>
      ) : !disabled ? (
        <View style={styles.buttons}>
          <Button
            title={r.vendor_reply ? 'Edit reply' : 'Reply'}
            variant="secondary"
            icon={<MessageSquareReply size={16} color={colors.ink} />}
            onPress={() => {
              setText(r.vendor_reply ?? '');
              setMode('reply');
            }}
            style={styles.flex}
          />
          {!r.flag_reason ? (
            <Button
              title="Flag"
              variant="secondary"
              icon={<Flag size={16} color={colors.ink} />}
              onPress={() => {
                setText('');
                setMode('flag');
              }}
              style={styles.flex}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl },
  grow: { flexGrow: 1 },
  header: { gap: space.md },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  big: { fontFamily: 'Outfit_700Bold', fontSize: 36, lineHeight: 40 },
  flex: { flex: 1 },
  review: { gap: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  reply: { backgroundColor: colors.background, borderRadius: radius.md, padding: space.md, gap: 2 },
  form: { gap: space.sm },
  buttons: { flexDirection: 'row', gap: space.sm },
});
