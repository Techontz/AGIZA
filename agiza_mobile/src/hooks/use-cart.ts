import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cartApi } from '@/lib/api/endpoints';
import type { Cart } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';

/** The server-side cart. Every change returns the re-priced cart, which replaces the cached one. */
export function useCart() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: keys.cart, queryFn: cartApi.get, enabled: status === 'signedIn' });
  const apply = (cart: Cart) => queryClient.setQueryData(keys.cart, cart);

  const add = useMutation({
    mutationFn: ({ variant, quantity }: { variant: number; quantity: number }) => cartApi.add(variant, quantity),
    onSuccess: apply,
  });
  const setQuantity = useMutation({
    mutationFn: ({ item, quantity }: { item: number; quantity: number }) => cartApi.setQuantity(item, quantity),
    onSuccess: apply,
  });
  const remove = useMutation({ mutationFn: (item: number) => cartApi.remove(item), onSuccess: apply });

  return { ...query, add, setQuantity, remove, count: query.data?.item_count ?? 0 };
}
