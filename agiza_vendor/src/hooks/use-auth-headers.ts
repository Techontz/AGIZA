import { useEffect, useState } from 'react';

import { authHeaders } from '@/lib/api/client';

/** Authorization header for private images (seller product photos, logo, banner, return evidence). */
export function useAuthHeaders() {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    authHeaders().then((h) => alive && setHeaders(h));
    return () => {
      alive = false;
    };
  }, []);
  return headers;
}
