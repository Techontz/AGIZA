import { router } from 'expo-router';

import { FormScreen } from '@/components/form-screen';
import { ProductEditor } from '@/components/seller/product-editor';
import { SuspendedBanner } from '@/components/seller/suspended-banner';
import { Notice } from '@/components/ui/states';
import { useStore } from '@/hooks/use-store';

export default function NewProductScreen() {
  const { suspended } = useStore();
  return (
    <FormScreen>
      <SuspendedBanner />
      <Notice tone="info">Fill in the details, then add photos on the next screen. AGIZA reviews every product before it goes live.</Notice>
      <ProductEditor
        disabled={suspended}
        onCreated={(p) => router.replace({ pathname: '/products/[id]', params: { id: String(p.id), created: '1' } })}
      />
    </FormScreen>
  );
}
