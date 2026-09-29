"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ApplicationForm, STORE_KEY } from "@/components/seller/application-form";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api/client";
import { sellerApi } from "@/lib/api/endpoints";

export default function ApplyPage() {
  const router = useRouter();
  const store = useQuery({ queryKey: STORE_KEY, queryFn: sellerApi.store, retry: false });
  const hasStore = store.isSuccess;
  useEffect(() => {
    if (hasStore) router.replace("/seller");
  }, [hasStore, router]);
  const none = store.error instanceof ApiError && store.error.status === 404;
  return (
    <Container className="max-w-3xl py-8 sm:py-10">
      <h1 className="text-[28px] font-bold text-ink">Apply to sell on AGIZA</h1>
      <p className="mt-1 mb-6 text-muted">Takes about five minutes. You can edit your application until AGIZA starts reviewing it.</p>
      <div className="rounded-lg bg-surface p-5 shadow-card sm:p-8">
        {none ? <ApplicationForm onDone={() => router.push("/seller")} /> : <Skeleton className="h-96" />}
      </div>
    </Container>
  );
}
