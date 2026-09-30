"use client";

import { Heart } from "lucide-react";

import { ProductGrid } from "@/components/product/product-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/states";
import { useWishlist } from "@/hooks/use-wishlist";
import { errorMessage } from "@/lib/api/client";

export default function SavedPage() {
  const { server } = useWishlist();
  return (
    <div className="space-y-4">
      <h1 className="text-[24px] font-medium text-ink">Saved products</h1>
      {server.isLoading ? (
        <Skeleton className="h-64" />
      ) : server.isError ? (
        <Notice tone="danger">{errorMessage(server.error)}</Notice>
      ) : !server.data?.products.length ? (
        <EmptyState icon={Heart} title="Nothing saved yet" text="Tap the heart on a product to keep it here for later." action={<ButtonLink href="/shop">Browse products</ButtonLink>} />
      ) : (
        <ProductGrid products={server.data.products} className="lg:grid-cols-3 xl:grid-cols-4" />
      )}
    </div>
  );
}
