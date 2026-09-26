"use client";

import { useQuery } from "@tanstack/react-query";
import { Link2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorText, fieldErrors } from "@/lib/api/errors";
import { ordersApi, quotesApi } from "@/lib/api/services/orders";
import {
  TASK_DEPARTMENTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  taskKeys,
  tasksApi,
  type Task,
  type TaskDepartment,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "@/lib/api/services/tasks";

type LinkKind = "international" | "express" | "equipment" | "quote";
interface LinkHit {
  id: number;
  reference: string;
  label: string;
}

const LINK_KINDS: [LinkKind, string][] = [
  ["international", "International order"],
  ["express", "Express delivery"],
  ["equipment", "Equipment / service order"],
  ["quote", "Quote"],
];
const OPEN_STATUSES: TaskStatus[] = ["in_progress", "waiting_for_client", "waiting_for_payment", "blocked", "review_required"];

async function searchLinks(kind: LinkKind, search: string, signal?: AbortSignal): Promise<LinkHit[]> {
  const q = { search, page_size: 8 };
  if (kind === "quote") {
    const r = await quotesApi.list(q, signal);
    return r.results.map((x) => ({ id: x.id, reference: x.reference, label: `${x.customer.full_name} · ${x.description}` }));
  }
  const r = await ordersApi[kind].list(q, signal);
  return r.results.map((x) => ({ id: x.id, reference: x.reference, label: `${x.customer.full_name} · ${x.item_details}` }));
}

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
function localInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewTaskModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (t: Task) => void;
}) {
  const owners = useQuery({ queryKey: taskKeys.owners, queryFn: tasksApi.owners, enabled: open });
  const [taskType, setTaskType] = useState<TaskType>("follow_up_client");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [department, setDepartment] = useState<TaskDepartment>("unassigned");
  const [status, setStatus] = useState<TaskStatus>("in_progress");
  const [deadline, setDeadline] = useState("");
  const [owner, setOwner] = useState("");
  const [description, setDescription] = useState("");
  const [linkKind, setLinkKind] = useState<LinkKind | "">("");
  const [linkSearch, setLinkSearch] = useState("");
  const [linked, setLinked] = useState<LinkHit | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const debounced = useDebouncedValue(linkSearch, 250);

  useEffect(() => {
    if (!open) return;
    setTaskType("follow_up_client");
    setPriority("medium");
    setDepartment("unassigned");
    setStatus("in_progress");
    setDeadline(localInput(new Date(Date.now() + 24 * 3_600_000)));
    setOwner("");
    setDescription("");
    setLinkKind("");
    setLinkSearch("");
    setLinked(null);
    setErrors({});
  }, [open]);

  const results = useQuery({
    queryKey: ["tasks", "link-search", linkKind, debounced],
    queryFn: ({ signal }) => searchLinks(linkKind as LinkKind, debounced.trim(), signal),
    enabled: open && Boolean(linkKind) && !linked && debounced.trim().length >= 2,
  });

  const create = useApiMutation(
    () =>
      tasksApi.create({
        task_type: taskType,
        description: description.trim(),
        sla_deadline: new Date(deadline).toISOString(),
        department,
        priority,
        status,
        owner: owner ? Number(owner) : null,
        order: linked && linkKind !== "quote" ? linked.id : null,
        quote: linked && linkKind === "quote" ? linked.id : null,
      }),
    {
      invalidate: [taskKeys.all],
      success: (t) => `${t.reference} created`,
      onSuccess: (t) => {
        onClose();
        onCreated(t);
      },
      onError: (e) => {
        setErrors(fieldErrors(e));
        toast.error(errorText(e));
      },
    },
  );

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!description.trim()) errs.description = "Describe what needs to be done.";
    if (!deadline || Number.isNaN(new Date(deadline).getTime())) errs.sla_deadline = "Set the SLA deadline.";
    setErrors(errs);
    if (!Object.keys(errs).length) create.mutate(undefined);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Task"
      size="2xl"
      footer={
        <>
          <Button className="flex-1" onClick={submit} loading={create.isPending}>Create Task</Button>
          <Button variant="muted" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Task Type" required htmlFor="nt-type" error={errors.task_type}>
            <Select id="nt-type" value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)}>
              {Object.entries(TASK_TYPES).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Priority" htmlFor="nt-priority" error={errors.priority}>
            <Select id="nt-priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {Object.entries(TASK_PRIORITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="SLA Deadline" required htmlFor="nt-sla" error={errors.sla_deadline}>
            <Input id="nt-sla" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} invalid={Boolean(errors.sla_deadline)} />
          </Field>
          <Field label="Department" htmlFor="nt-dept" error={errors.department}>
            <Select id="nt-dept" value={department} onChange={(e) => setDepartment(e.target.value as TaskDepartment)}>
              {Object.entries(TASK_DEPARTMENTS).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Owner" htmlFor="nt-owner" error={errors.owner}>
            <Select id="nt-owner" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={owners.isPending}>
              <option value="">{owners.isPending ? "Loading staff…" : "Unassigned"}</option>
              {owners.data?.map((o) => <option key={o.id} value={o.id}>{o.full_name}{o.role ? ` — ${o.role}` : ""}</option>)}
            </Select>
          </Field>
          <Field label="Status" htmlFor="nt-status" error={errors.status}>
            <Select id="nt-status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {OPEN_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUSES[s][1]}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="Description" required htmlFor="nt-desc" error={errors.description}>
          <Textarea id="nt-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What needs to be done..." />
        </Field>

        <div>
          <p className="block text-sm font-medium text-gray-700 mb-2">Linked Item (optional)</p>
          {linked ? (
            <div className="flex items-center justify-between gap-3 px-4 py-2 border border-blue-200 rounded-lg bg-blue-50">
              <div className="flex items-center gap-2 min-w-0">
                <Link2 className="size-4 text-blue-600 flex-shrink-0" />
                <span className="font-mono font-semibold text-blue-900">{linked.reference}</span>
                <span className="text-xs text-blue-700 truncate">{linked.label}</span>
              </div>
              <button type="button" onClick={() => setLinked(null)} className="p-1 rounded hover:bg-blue-100" aria-label="Remove linked item">
                <X className="size-4 text-blue-700" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select
                aria-label="Linked item type"
                value={linkKind}
                onChange={(e) => {
                  setLinkKind(e.target.value as LinkKind | "");
                  setLinkSearch("");
                }}
              >
                <option value="">None</option>
                {LINK_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
              {linkKind && (
                <div className="relative sm:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Search by reference or customer..."
                    value={linkSearch}
                    onChange={(e) => setLinkSearch(e.target.value)}
                    aria-label="Search linked item"
                  />
                </div>
              )}
            </div>
          )}
          {(errors.order || errors.quote) && <p className="text-xs text-red-600 mt-1">{errors.order ?? errors.quote}</p>}
          {!linked && linkKind && debounced.trim().length >= 2 && (
            <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {results.isPending ? (
                <p className="px-3 py-2 text-sm text-gray-400">Searching…</p>
              ) : results.isError ? (
                <p className="px-3 py-2 text-sm text-red-600">{errorText(results.error)}</p>
              ) : results.data?.length ? (
                results.data.map((r) => (
                  <button key={r.id} type="button" onClick={() => setLinked(r)} className="w-full text-left px-3 py-2 hover:bg-gray-50">
                    <span className="text-sm font-semibold text-gray-900 font-mono">{r.reference}</span>
                    <span className="text-xs text-gray-500 ml-2">{r.label}</span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-gray-500">Nothing matches “{debounced}”.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
