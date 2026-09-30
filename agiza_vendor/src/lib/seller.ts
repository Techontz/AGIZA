/** Labels and badge colours for seller records. Statuses and amounts always come from the server. */
import type { Tone } from '@/components/ui/badge';

import type { ApprovalStatus, ListingState, RefundStatus, SellerReturn } from './api/types';

export const LISTING: Record<ListingState, { label: string; tone: Tone }> = {
  published: { label: 'Live', tone: 'success' },
  pending_review: { label: 'Waiting for AGIZA review', tone: 'warning' },
  draft: { label: 'Draft', tone: 'neutral' },
  rejected: { label: 'Changes needed', tone: 'danger' },
  inactive: { label: 'Hidden', tone: 'neutral' },
  disabled: { label: 'Disabled by AGIZA', tone: 'danger' },
};

export const APPROVAL_TONE: Record<ApprovalStatus, Tone> = {
  pending: 'warning',
  under_review: 'info',
  changes_requested: 'warning',
  approved: 'success',
  rejected: 'danger',
  suspended: 'danger',
};

export function fulfilmentTone(status: string): Tone {
  if (status === 'pending') return 'warning';
  if (status === 'cancelled') return 'danger';
  if (status === 'delivered') return 'success';
  if (status === 'ready') return 'brand';
  return 'info';
}

export function settlementTone(status: string): Tone {
  return status === 'payable' ? 'brand' : status === 'settled' ? 'success' : status === 'void' ? 'danger' : 'neutral';
}

export const PAYOUT_TONE: Record<string, Tone> = {
  processing: 'info',
  paid: 'success',
  failed: 'danger',
  reversed: 'warning',
};

export function returnTone(r: Pick<SellerReturn, 'status' | 'refund_status'>): Tone {
  if (r.refund_status === 'refunded') return 'success';
  if (r.status === 'rejected') return 'danger';
  if (r.refund_status === 'pending') return 'brand';
  return 'info';
}

export const REFUND_LABEL: Record<RefundStatus, string> = {
  not_decided: 'Not decided yet',
  pending: 'Approved, refund pending',
  refunded: 'Refunded to the customer',
  none: 'No refund',
};

/** Order filters: "open" is everything still to accept or prepare. */
export const ORDER_FILTERS = [
  { value: 'open', label: 'To prepare' },
  { value: 'shipped', label: 'Collected' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: '', label: 'All' },
] as const;

export const ISSUE_TYPES = [
  { value: 'item_unavailable', label: 'An item is unavailable' },
  { value: 'stock_discrepancy', label: 'Stock count was wrong' },
  { value: 'damaged_item', label: 'An item is damaged' },
  { value: 'cannot_fulfill', label: "I can't fulfil this order" },
  { value: 'other', label: 'Other problem' },
];

export const DOC_KINDS = [
  { value: 'business_license', label: 'Business licence' },
  { value: 'tin_certificate', label: 'TIN certificate' },
  { value: 'registration', label: 'Registration certificate' },
  { value: 'id', label: "Owner's ID" },
  { value: 'other', label: 'Other' },
];

export const CONDITIONS = [
  { value: 'new', label: 'New' },
  { value: 'used', label: 'Used' },
  { value: 'refurbished', label: 'Refurbished' },
  { value: 'open_box', label: 'Open box' },
];

export const BUSINESS_TYPES = [
  { value: 'individual', label: 'Individual / sole trader' },
  { value: 'company', label: 'Registered company' },
];

export const PAYOUT_METHODS = [
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank', label: 'Bank transfer' },
];

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
