import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { StarPicker } from '@/components/rating';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/client';
import { reviewApi } from '@/lib/api/endpoints';
import type { MyReview } from '@/lib/api/types';
import { keys } from '@/lib/query';
import { colors } from '@/theme/tokens';

function ReviewForm({ productId, name, mine }: { productId: number; name: string; mine: MyReview | null }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [title, setTitle] = useState(mine?.title ?? '');
  const [body, setBody] = useState(mine?.body ?? '');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['reviews'] });
    queryClient.invalidateQueries({ queryKey: keys.product(productId) });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };
  const submit = useMutation({
    mutationFn: () => reviewApi.submit(productId, { rating, title: title.trim(), body: body.trim() }),
    onSuccess: (saved) => {
      refresh();
      router.back();
      if (saved.status !== 'published') {
        Alert.alert('Thank you!', 'Your review will appear once AGIZA has checked it.');
      }
    },
  });
  const remove = useMutation({
    mutationFn: () => reviewApi.remove(mine!.id),
    onSuccess: () => {
      refresh();
      router.back();
    },
  });
  const err = submit.error instanceof ApiError ? submit.error : null;

  return (
    <FormScreen>
      <Stack.Screen options={{ title: mine ? 'Edit your review' : 'Write a review' }} />
      {name ? (
        <Text variant="subheading" color={colors.ink} numberOfLines={2}>
          {name}
        </Text>
      ) : null}
      <StarPicker value={rating} onChange={setRating} />
      {err?.field('rating') ? <Notice tone="danger">{err.field('rating')}</Notice> : null}
      <Input
        label="Title (optional)"
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        placeholder="Sum it up in a few words"
        error={err?.field('title')}
        returnKeyType="next"
      />
      <Input
        label="Your review (optional)"
        value={body}
        onChangeText={setBody}
        maxLength={2000}
        multiline
        placeholder="What did you like or dislike? How did it work for you?"
        error={err?.field('body')}
        hint={`${body.length}/2000`}
      />
      {submit.isError && !err?.field('title') && !err?.field('body') && !err?.field('rating') ? (
        <Notice tone="danger">{errorMessage(submit.error)}</Notice>
      ) : null}
      {remove.isError ? <Notice tone="danger">{errorMessage(remove.error)}</Notice> : null}
      <Button
        title={mine ? 'Save changes' : 'Post review'}
        onPress={() => submit.mutate()}
        loading={submit.isPending}
        disabled={rating < 1 || remove.isPending}
        accessibilityHint={rating < 1 ? 'Choose a star rating first' : undefined}
      />
      {mine ? (
        <Button
          title="Delete my review"
          variant="danger"
          loading={remove.isPending}
          disabled={submit.isPending}
          onPress={() =>
            Alert.alert('Delete your review?', 'This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
            ])
          }
        />
      ) : null}
    </FormScreen>
  );
}

/** Write or edit my review of a product (only after a delivered purchase; the server decides). */
export default function WriteReviewScreen() {
  const params = useLocalSearchParams<{ productId: string; name?: string }>();
  const productId = Number(params.productId);
  const reviews = useQuery({
    queryKey: [...keys.reviews(productId), 'signedIn'],
    queryFn: () => reviewApi.forProduct(productId),
  });
  if (reviews.isLoading) return <Loading />;
  if (reviews.isError || !reviews.data) return <ErrorState error={reviews.error} onRetry={() => reviews.refetch()} />;
  if (!reviews.data.can_review) {
    return (
      <FormScreen>
        <Stack.Screen options={{ title: 'Write a review' }} />
        <Notice tone="info">You can review this product once an order with it has been delivered to you.</Notice>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </FormScreen>
    );
  }
  return <ReviewForm productId={productId} name={params.name ?? ''} mine={reviews.data.mine} />;
}
