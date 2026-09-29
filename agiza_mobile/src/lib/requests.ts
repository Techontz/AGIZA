import type { Tone } from '@/components/ui/badge';
import type { QuoteRequest } from '@/lib/api/types';

export const QUOTE_TONE: Record<QuoteRequest['status'], Tone> = {
  new: 'neutral',
  waiting_reply: 'brand',
  answered: 'info',
  declined: 'danger',
  approved: 'success',
  cancelled: 'danger',
};

/** The request's first line without its "[Buy for me]" marker. */
export function requestTitle(q: QuoteRequest) {
  return q.description.split('\n')[0].replace(/^\[(Buy|Deliver) for me\]\s*/, '');
}

export function requestKind(q: QuoteRequest) {
  return q.description.startsWith('[Deliver for me]') ? 'Deliver for me' : 'Buy for me';
}
