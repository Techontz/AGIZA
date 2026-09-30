import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { wishlistApi } from '@/lib/api/endpoints';
import type { Wishlist } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';

/** The signed-in customer's saved products. Every change returns the new list, which replaces the cached one. */
export function useWishlist() {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: keys.wishlist, queryFn: wishlistApi.get, enabled: signedIn, staleTime: 60_000 });

  const toggle = useMutation({
    mutationFn: ({ product, save }: { product: number; save: boolean }) =>
      save ? wishlistApi.add(product) : wishlistApi.remove(product),
    onMutate: async ({ product, save }) => {
      // Flip the heart straight away; the server's list replaces this when it answers.
      await queryClient.cancelQueries({ queryKey: keys.wishlist });
      const previous = queryClient.getQueryData<Wishlist>(keys.wishlist);
      if (previous) {
        queryClient.setQueryData<Wishlist>(keys.wishlist, {
          ...previous,
          product_ids: save ? [product, ...previous.product_ids] : previous.product_ids.filter((id) => id !== product),
          products: save ? previous.products : previous.products.filter((p) => p.id !== product),
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) queryClient.setQueryData(keys.wishlist, context.previous);
    },
    onSuccess: (list) => queryClient.setQueryData(keys.wishlist, list),
  });

  const ids = query.data?.product_ids;
  const isSaved = (product: number) => !!ids?.includes(product);
  /** Signed-out customers are sent to sign in. */
  const toggleSaved = (product: number) => {
    if (!signedIn) return router.push('/login');
    toggle.mutate({ product, save: !isSaved(product) });
  };

  return { ...query, isSaved, toggleSaved, toggle };
}
