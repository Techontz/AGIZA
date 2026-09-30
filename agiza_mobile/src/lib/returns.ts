import type { Tone } from '@/components/ui/badge';
import type { RefundStatus } from '@/lib/api/types';

/** Badge colour for the server's customer-facing return status label. */
export function returnTone(statusDisplay: string): Tone {
  const s = statusDisplay.toLowerCase();
  if (s === 'rejected') return 'danger';
  if (s === 'refunded' || s === 'approved') return 'success';
  if (s === 'closed') return 'neutral';
  if (s === 'refund pending' || s === 'requested') return 'warning';
  return 'info';
}

export const REFUND_LABEL: Record<RefundStatus, string> = {
  not_decided: 'Refund not decided yet',
  pending: 'Refund pending',
  refunded: 'Refunded',
  none: 'No refund',
};

export function refundTone(status: RefundStatus): Tone {
  return status === 'refunded' ? 'success' : status === 'pending' ? 'warning' : 'neutral';
}
