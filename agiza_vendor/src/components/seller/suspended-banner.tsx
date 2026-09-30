import { Notice } from '@/components/ui/states';
import { useStore } from '@/hooks/use-store';

/** Shown on every seller screen while AGIZA has suspended the store: everything is read-only. */
export function SuspendedBanner() {
  const { store, suspended } = useStore();
  if (!suspended) return null;
  return (
    <Notice tone="danger">
      Your store is suspended. Customers can&apos;t see your products and nothing can be changed.
      {store?.review_note ? ` Reason: ${store.review_note}` : ''} Contact AGIZA to resolve it.
    </Notice>
  );
}
