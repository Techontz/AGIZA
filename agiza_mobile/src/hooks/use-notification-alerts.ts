import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { notificationApi } from '@/lib/api/endpoints';
import type { InboxNotification } from '@/lib/api/types';
import { keys } from '@/lib/query';

import { openNotificationTarget } from './use-notifications';

/**
 * Keeps notifications live while the app runs: checks the inbox every 30 s (and on returning to the
 * app), shows a phone notification for anything new, and opens the right screen when one is tapped,
 * whether it came from this check or from a push.
 */
export function useNotificationAlerts(enabled: boolean) {
  const queryClient = useQueryClient();
  const newest = useRef<number | null>(null);
  const inbox = useQuery({
    queryKey: [...keys.notifications, 'latest'],
    queryFn: () => notificationApi.list(1, 5),
    enabled,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const rows = inbox.data?.results ?? [];
    if (!rows.length) return;
    const top = Math.max(...rows.map((n) => n.id));
    if (newest.current === null) {
      newest.current = top; // first look: what is already there was seen in the inbox, not new
      return;
    }
    const fresh = rows.filter((n) => n.id > newest.current! && !n.read).slice(0, 3);
    newest.current = Math.max(top, newest.current);
    if (!fresh.length) return;
    queryClient.invalidateQueries({ queryKey: keys.unread });
    for (const n of fresh) {
      Notifications.scheduleNotificationAsync({
        content: { title: n.title, body: n.body, data: { ...(n.data ?? {}), notification_id: n.id } },
        trigger: null,
      }).catch(() => null);
    }
  }, [inbox.data, queryClient]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') inbox.refetch();
    });
    return () => sub.remove();
  }, [enabled, inbox]);

  useEffect(() => {
    const open = (response: Notifications.NotificationResponse) => {
      const data = (response.notification.request.content.data ?? {}) as InboxNotification['data'];
      openNotificationTarget({ id: 0, title: '', body: '', data, read: false, created_at: '' });
    };
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
