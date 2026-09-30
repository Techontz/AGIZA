import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { notificationApi } from '@/lib/api/endpoints';
import type { InboxNotification } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';

/** Unread inbox count for the bell badge (the server counts; the app only shows it). */
export function useUnreadNotifications() {
  const { status } = useAuth();
  const query = useQuery({
    queryKey: keys.unread,
    queryFn: () => notificationApi.list(1, 1),
    enabled: status === 'signedIn',
    refetchInterval: 120_000,
  });
  return status === 'signedIn' ? (query.data?.unread ?? 0) : 0;
}

/** Where a notification leads, from the `data` the server attached. False when there is nothing to open. */
export function openNotificationTarget(n: InboxNotification): boolean {
  const data = n.data ?? {};
  const screen = data.screen ?? data.type;
  if ((screen === 'order' || screen === 'order_status' || screen === 'payment') && typeof data.order === 'string') {
    router.push({ pathname: '/order/[reference]', params: { reference: data.order } });
    return true;
  }
  if (screen === 'return' && typeof data.return === 'string') {
    router.push({ pathname: '/returns/[reference]', params: { reference: data.return } });
    return true;
  }
  if ((screen === 'quotation' || screen === 'quote') && data.quote !== undefined && data.quote !== null) {
    router.push({ pathname: '/requests/[id]', params: { id: String(data.quote) } });
    return true;
  }
  if (screen === 'chat') {
    router.push('/support');
    return true;
  }
  if (typeof data.order === 'string') {
    router.push({ pathname: '/order/[reference]', params: { reference: data.order } });
    return true;
  }
  return false;
}
