import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { notificationApi } from '@/lib/api/endpoints';
import type { SellerNotification } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';

/** Unread seller inbox count for the bell badge (the server counts; the app only shows it). 0 if unavailable. */
export function useUnreadNotifications() {
  const { status } = useAuth();
  const query = useQuery({
    queryKey: keys.unread,
    queryFn: () => notificationApi.list(1, 1),
    enabled: status === 'signedIn',
    refetchInterval: 120_000,
    retry: false,
  });
  return status === 'signedIn' ? (query.data?.unread ?? 0) : 0;
}

function asId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Opens the screen a seller notification is about, from its `data`. False when there is nothing to open. */
export function openNotificationTarget(n: Pick<SellerNotification, 'data'>): boolean {
  const data = n.data ?? {};
  const orderId = asId(data.order_id) ?? asId(data.fulfillment);
  if (orderId !== null) {
    router.push({ pathname: '/orders/[id]', params: { id: String(orderId) } });
    return true;
  }
  const ret = typeof data.return === 'string' ? data.return : typeof data.reference === 'string' && data.reference.startsWith('RET') ? data.reference : null;
  if (ret) {
    router.push({ pathname: '/returns/[reference]', params: { reference: ret } });
    return true;
  }
  if (data.review !== undefined && data.review !== null) {
    router.push('/reviews');
    return true;
  }
  return false;
}
