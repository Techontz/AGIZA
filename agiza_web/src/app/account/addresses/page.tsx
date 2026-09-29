"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ADDRESSES_KEY, AddressForm } from "@/components/account/address-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { addressApi } from "@/lib/api/endpoints";
import type { Address } from "@/lib/api/types";

export default function AddressesPage() {
  const client = useQueryClient();
  const list = useQuery({ queryKey: ADDRESSES_KEY, queryFn: addressApi.list });
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => addressApi.remove(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ADDRESSES_KEY }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Addresses</h1>
        {!editing ? (
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            Add address
          </Button>
        ) : null}
      </div>
      {editing ? (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-ink">{editing === "new" ? "New address" : "Edit address"}</h2>
          <AddressForm address={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
        </Card>
      ) : null}
      {list.isLoading ? (
        <Skeleton className="h-32" />
      ) : !list.data?.length && !editing ? (
        <EmptyState icon={MapPin} title="No saved addresses" text="Add one to see delivery options and costs at checkout." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.data?.map((a) => (
            <li key={a.id} className="rounded-lg bg-surface p-4 shadow-card">
              <p className="flex items-center gap-2 font-semibold text-ink">
                {a.label || a.city_name} {a.is_default ? <Badge tone="brand">Default</Badge> : null}
              </p>
              <p className="mt-1 text-[14px] text-muted">{a.one_line}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" loading={remove.isPending && remove.variables === a.id} onClick={() => remove.mutate(a.id)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
