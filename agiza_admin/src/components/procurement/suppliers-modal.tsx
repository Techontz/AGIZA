"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Edit2, Plus, Power, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, SearchInput, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TBody, THead, Table, TableSkeletonRows, Td, Th, Tr } from "@/components/ui/table";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { can, useMe } from "@/hooks/use-me";
import { ApiError } from "@/lib/api/client";
import { errorText, fieldErrors } from "@/lib/api/errors";
import { queryKeys } from "@/lib/api/query-keys";
import { locationsService } from "@/lib/api/services/locations";
import { procurementKeys, suppliersApi, type Supplier, type SupplierInput } from "@/lib/api/services/procurement";

const EMPTY: Record<keyof SupplierInput, string> = {
  name: "", country: "", contact_person: "", phone: "", email: "", website: "", address: "", notes: "", is_active: "true",
};

function SupplierForm({ supplier, onDone }: { supplier: Supplier | null; onDone: () => void }) {
  const countries = useQuery({ queryKey: queryKeys.countries(), queryFn: () => locationsService.countries() });
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setErrors({});
    setV(
      supplier
        ? {
            name: supplier.name, country: String(supplier.country_detail.id), contact_person: supplier.contact_person,
            phone: supplier.phone, email: supplier.email, website: supplier.website, address: supplier.address,
            notes: supplier.notes, is_active: String(supplier.is_active),
          }
        : EMPTY,
    );
  }, [supplier]);
  const set = (k: keyof SupplierInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  const save = useApiMutation(
    () => {
      const data: SupplierInput = {
        name: v.name.trim(), country: Number(v.country), contact_person: v.contact_person.trim(), phone: v.phone.trim(),
        email: v.email.trim(), website: v.website.trim(), address: v.address.trim(), notes: v.notes.trim(),
        is_active: v.is_active === "true",
      };
      return supplier ? suppliersApi.update(supplier.id, data) : suppliersApi.create(data);
    },
    {
      invalidate: [procurementKeys.suppliersAll],
      success: (s) => (supplier ? `${s.name} updated` : `${s.name} added`),
      onSuccess: onDone,
      onError: (e) => {
        setErrors(fieldErrors(e));
        toast.error(errorText(e));
      },
    },
  );
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!v.name.trim()) errs.name = "Enter the supplier name.";
    if (!v.country) errs.country = "Choose a country.";
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate(undefined);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Supplier Name" required htmlFor="sf-name" error={errors.name}>
          <Input id="sf-name" value={v.name} onChange={set("name")} invalid={Boolean(errors.name)} />
        </Field>
        <Field label="Country" required htmlFor="sf-country" error={errors.country}>
          <Select id="sf-country" value={v.country} onChange={set("country")} disabled={countries.isPending}>
            <option value="">{countries.isPending ? "Loading…" : "Select country..."}</option>
            {countries.data?.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
          </Select>
        </Field>
        <Field label="Contact Person" htmlFor="sf-contact" error={errors.contact_person}>
          <Input id="sf-contact" value={v.contact_person} onChange={set("contact_person")} />
        </Field>
        <Field label="Phone" htmlFor="sf-phone" error={errors.phone}>
          <Input id="sf-phone" value={v.phone} onChange={set("phone")} />
        </Field>
        <Field label="Email" htmlFor="sf-email" error={errors.email}>
          <Input id="sf-email" type="email" value={v.email} onChange={set("email")} />
        </Field>
        <Field label="Website" htmlFor="sf-web" error={errors.website}>
          <Input id="sf-web" type="url" value={v.website} onChange={set("website")} placeholder="https://" />
        </Field>
      </div>
      <Field label="Address" htmlFor="sf-address" error={errors.address}>
        <Textarea id="sf-address" rows={2} value={v.address} onChange={set("address")} />
      </Field>
      <Field label="Notes" htmlFor="sf-notes" error={errors.notes}>
        <Textarea id="sf-notes" rows={2} value={v.notes} onChange={set("notes")} />
      </Field>
      <Field label="Status" htmlFor="sf-active">
        <Select id="sf-active" value={v.is_active} onChange={set("is_active")}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </Field>
      <div className="flex gap-2 pt-2">
        <Button className="flex-1" onClick={submit} loading={save.isPending}>{supplier ? "Save Supplier" : "Add Supplier"}</Button>
        <Button variant="muted" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

/** Supplier directory: search, add/edit, activate/deactivate, delete unused. */
export function SuppliersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: me } = useMe();
  const canEdit = can(me, "procurement", "edit");
  const canManage = can(me, "procurement", "manage");
  const [mode, setMode] = useState<{ kind: "list" } | { kind: "form"; supplier: Supplier | null }>({ kind: "list" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search);
  const [removing, setRemoving] = useState<Supplier | null>(null);
  const [inUse, setInUse] = useState<Supplier | null>(null);
  useEffect(() => setPage(1), [debounced]);
  useEffect(() => {
    if (open) setMode({ kind: "list" });
  }, [open]);

  const query = { search: debounced, page, page_size: 10, ordering: "name" };
  const list = useQuery({
    queryKey: procurementKeys.suppliers(query),
    queryFn: ({ signal }) => suppliersApi.list(query, signal),
    placeholderData: keepPreviousData,
    enabled: open,
  });
  const toggle = useApiMutation((s: Supplier) => suppliersApi.update(s.id, { is_active: !s.is_active }), {
    invalidate: [procurementKeys.suppliersAll],
    success: (s) => `${s.name} ${s.is_active ? "activated" : "deactivated"}`,
    onSuccess: () => setInUse(null),
  });
  const remove = useApiMutation((s: Supplier) => suppliersApi.remove(s.id), {
    invalidate: [procurementKeys.suppliersAll],
    success: "Supplier deleted",
    onSuccess: () => setRemoving(null),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        setInUse(removing);
        setRemoving(null);
      } else toast.error(errorText(e));
    },
  });
  const rows = list.data?.results ?? [];

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="4xl"
        title={
          mode.kind === "form" ? (
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setMode({ kind: "list" })} className="p-1 rounded hover:bg-gray-100" aria-label="Back to suppliers">
                <ArrowLeft className="size-5 text-gray-500" />
              </button>
              {mode.supplier ? `Edit ${mode.supplier.name}` : "New Supplier"}
            </span>
          ) : (
            "Suppliers"
          )
        }
      >
        {mode.kind === "form" ? (
          <SupplierForm supplier={mode.supplier} onDone={() => setMode({ kind: "list" })} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
              <SearchInput placeholder="Search by name, reference, contact..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search suppliers" />
              {canEdit && (
                <Button onClick={() => setMode({ kind: "form", supplier: null })}>
                  <Plus className="size-4" /> Add Supplier
                </Button>
              )}
            </div>
            {list.isError && !list.data ? (
              <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
            ) : !list.isPending && rows.length === 0 ? (
              <EmptyState icon={Building2} title="No suppliers found" description={debounced ? "Try a different search" : "Add the first supplier to start sourcing"} />
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <Table>
                  <THead>
                    <Th>Supplier</Th>
                    <Th>Country</Th>
                    <Th>Contact</Th>
                    <Th>Orders</Th>
                    <Th>Status</Th>
                    {canEdit && <Th>Actions</Th>}
                  </THead>
                  <TBody>
                    {list.isPending ? (
                      <TableSkeletonRows rows={4} columns={canEdit ? 6 : 5} />
                    ) : (
                      rows.map((s) => (
                        <Tr key={s.id}>
                          <Td>
                            <div className="font-semibold text-gray-900">{s.name}</div>
                            <div className="text-xs text-gray-500">{s.reference}</div>
                          </Td>
                          <Td className="text-sm text-gray-900 whitespace-nowrap">{s.country_detail.name}</Td>
                          <Td>
                            <div className="text-sm text-gray-900">{s.contact_person || "—"}</div>
                            <div className="text-xs text-gray-500">{s.phone || s.email}</div>
                          </Td>
                          <Td className="text-sm text-gray-900">{s.orders_count}</Td>
                          <Td><Badge tone={s.is_active ? "green" : "gray"}>{s.is_active ? "Active" : "Inactive"}</Badge></Td>
                          {canEdit && (
                            <Td>
                              <div className="flex items-center gap-3 whitespace-nowrap">
                                <button type="button" onClick={() => setMode({ kind: "form", supplier: s })} className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1">
                                  <Edit2 className="size-3" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggle.mutate(s)}
                                  disabled={toggle.isPending && toggle.variables?.id === s.id}
                                  className="text-gray-600 hover:text-gray-900 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
                                >
                                  <Power className="size-3" /> {s.is_active ? "Deactivate" : "Activate"}
                                </button>
                                {canManage && (
                                  <button type="button" onClick={() => setRemoving(s)} className="text-red-600 hover:text-red-800 text-sm font-medium flex items-center gap-1">
                                    <Trash2 className="size-3" /> Delete
                                  </button>
                                )}
                              </div>
                            </Td>
                          )}
                        </Tr>
                      ))
                    )}
                  </TBody>
                </Table>
                {list.data && list.data.total_pages > 1 && (
                  <Pagination page={list.data.page} pageSize={list.data.page_size} count={list.data.count} totalPages={list.data.total_pages} onPageChange={setPage} disabled={list.isFetching} />
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Delete Supplier"
        tone="danger"
        confirmLabel="Delete"
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
        message={<p>Delete <strong>{removing?.name}</strong>? This can&apos;t be undone.</p>}
      />
      <ConfirmDialog
        open={Boolean(inUse)}
        onClose={() => setInUse(null)}
        title="Supplier In Use"
        confirmLabel="Deactivate Instead"
        pending={toggle.isPending}
        onConfirm={() => inUse && toggle.mutate({ ...inUse, is_active: true })}
        message={
          <p>
            <strong>{inUse?.name}</strong> is linked to procurement orders and can&apos;t be deleted. Deactivate it so it can no
            longer be selected for new orders.
          </p>
        }
      />
    </>
  );
}
