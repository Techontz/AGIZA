import { useQuery } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/client';
import { sellerApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';

/**
 * The signed-in account's store (or application). 404 means the account has no store yet.
 * `phase` decides which part of the app the seller sees.
 */
export function useStore() {
  const { status } = useAuth();
  const query = useQuery({
    queryKey: keys.store,
    queryFn: sellerApi.store,
    enabled: status === 'signedIn',
    retry: (count, error) => !(error instanceof ApiError && error.status < 500 && error.status !== 0) && count < 2,
  });
  const noStore = query.error instanceof ApiError && query.error.status === 404;
  const s = query.data;
  let phase: 'loading' | 'error' | 'none' | 'application' | 'seller';
  if (s) phase = s.approval_status === 'approved' || s.approval_status === 'suspended' ? 'seller' : 'application';
  else if (noStore) phase = 'none';
  else if (query.isError) phase = 'error';
  else phase = 'loading';
  return { ...query, store: s ?? null, phase, suspended: s?.approval_status === 'suspended' };
}
