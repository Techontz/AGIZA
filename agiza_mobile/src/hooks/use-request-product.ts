import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { requestApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';

type Ask = { id: number; name: string; quantity?: number; options?: string };

/**
 * Ask AGIZA to source a shop product that is out of stock. It becomes a "Buy for me" request that
 * staff see in Intake & Quotes (with the shop product named), and the customer gets a quotation.
 */
export function useRequestProduct() {
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, name, quantity = 1, options }: Ask) =>
      requestApi.create({
        request_type: 'buy_for_me',
        item_name: [name, options].filter(Boolean).join(' — ').slice(0, 160),
        quantity,
        product: id,
        details: `Out of stock in the AGIZA app. Please source ${quantity} for me.`,
      }),
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: keys.requests });
      router.push({ pathname: '/requests/[id]', params: { id: quote.id, created: '1' } });
    },
  });
  const request = (ask: Ask) => (status === 'signedIn' ? mutation.mutate(ask) : router.push('/login'));
  return { request, mutation };
}
