"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { ImageManager, ProductEditor } from "@/components/seller/product-editor";
import { Button } from "@/components/ui/button";
import { Notice, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { sellerApi } from "@/lib/api/endpoints";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fresh = useSearchParams().get("new");
  const product = useQuery({ queryKey: ["seller", "product", Number(id)], queryFn: () => sellerApi.product(Number(id)) });
  const remove = useMutation({
    mutationFn: () => sellerApi.deleteProduct(Number(id)),
    onSuccess: (r) => {
      toast.success(r.result === "deleted" ? "Product deleted" : "Product has orders, so it was hidden instead");
      router.push("/seller/products");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (product.isLoading) return <Skeleton className="h-96" />;
  if (product.isError || !product.data) return <Notice tone="danger">{errorMessage(product.error)}</Notice>;
  return (
    <>
      <Link href="/seller/products" className="inline-flex items-center gap-1 text-[14px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Products
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">{product.data.name}</h1>
        <Button variant="danger" size="sm" loading={remove.isPending} onClick={() => confirm("Delete this product? Products with orders are hidden instead.") && remove.mutate()}>
          Delete
        </Button>
      </div>
      {fresh ? <Notice tone="success">Product created. Add photos below — products with good photos sell better.</Notice> : null}
      <ImageManager product={product.data} />
      <ProductEditor key={product.data.updated_at} product={product.data} />
    </>
  );
}
