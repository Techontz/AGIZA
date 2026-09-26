"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Edit2, ExternalLink, MessageSquare, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal, SlidePanel } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { can, useMe } from "@/hooks/use-me";
import { errorText, fieldErrors } from "@/lib/api/errors";
import { taskKeys, tasksApi, type Task, type TaskStatus } from "@/lib/api/services/tasks";
import { formatDateTime } from "@/lib/format";

import { SlaTimer, TaskStatusBadge, TaskTypeBadge, linkedItemHref, linkedKindLabel, useNow } from "./badges";

const INVALIDATE = [taskKeys.all];

/* ----------------------------------------------------------- change status */

function StatusDialog({ task, open, onClose, canManage }: { task: Task; open: boolean; onClose: () => void; canManage: boolean }) {
  const choices = task.allowed_transitions.filter((t) => t.value !== "completed" && (t.value !== "cancelled" || canManage));
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => {
    if (open) {
      setStatus(choices[0]?.value ?? "");
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const move = useApiMutation(() => tasksApi.changeStatus(task.id, status as TaskStatus, note.trim()), {
    invalidate: INVALIDATE,
    success: (t) => `${t.reference}: ${t.status_display}`,
    onSuccess: () => {
      setConfirmCancel(false);
      onClose();
    },
  });
  const submit = () => (status === "cancelled" ? setConfirmCancel(true) : move.mutate(undefined));

  return (
    <>
      <Modal
        open={open && !confirmCancel}
        onClose={onClose}
        title="Change Status"
        size="md"
        footer={
          <>
            <Button className="flex-1" onClick={submit} loading={move.isPending} disabled={!status}>Update Status</Button>
            <Button variant="muted" onClick={onClose}>Cancel</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Current status: <strong>{task.status_display}</strong></p>
          {choices.length === 0 ? (
            <p className="text-sm text-gray-500">No other status is available.</p>
          ) : (
            <Field label="New status" required htmlFor="ts-status">
              <Select id="ts-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {choices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Note (optional)" htmlFor="ts-note">
            <Textarea id="ts-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why the status is changing..." />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={open && confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel Task"
        tone="danger"
        confirmLabel="Cancel Task"
        pending={move.isPending}
        onConfirm={() => move.mutate(undefined)}
        message={<p>Cancel <strong>{task.reference}</strong>? It will leave the open task list. A manager can reopen it later.</p>}
      />
    </>
  );
}

/* ------------------------------------------------------------------ panel */

/** Design: Task Detail slide-in panel, backed by the tasks API. */
export function TaskDetailPanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const router = useRouter();
  const now = useNow();
  const { data: me } = useMe();
  const canEdit = can(me, "tasks", "edit");
  const canManage = can(me, "tasks", "manage");
  const owners = useQuery({ queryKey: taskKeys.owners, queryFn: tasksApi.owners, enabled: canEdit });
  const [editingOwner, setEditingOwner] = useState(false);
  const [owner, setOwner] = useState("");
  const [newNote, setNewNote] = useState("");
  const [noteError, setNoteError] = useState<string | undefined>();
  const [statusOpen, setStatusOpen] = useState(false);

  useEffect(() => {
    setEditingOwner(false);
    setNewNote("");
    setNoteError(undefined);
  }, [task.id]);
  useEffect(() => {
    if (editingOwner) setOwner(task.owner ? String(task.owner.id) : "");
  }, [editingOwner, task.owner]);

  const assign = useApiMutation(() => tasksApi.assign(task.id, owner ? Number(owner) : null), {
    invalidate: INVALIDATE,
    success: (t) => (t.owner ? `${t.reference} assigned to ${t.owner.full_name}` : `${t.reference} unassigned`),
    onSuccess: () => setEditingOwner(false),
  });
  const addNote = useApiMutation(() => tasksApi.addNote(task.id, newNote.trim()), {
    invalidate: INVALIDATE,
    success: "Note added",
    onSuccess: () => setNewNote(""),
    onError: (e) => {
      setNoteError(fieldErrors(e).body);
      toast.error(errorText(e));
    },
  });
  const complete = useApiMutation(() => tasksApi.complete(task.id), { invalidate: INVALIDATE, success: (t) => `${t.reference} completed` });
  const reopen = useApiMutation(() => tasksApi.changeStatus(task.id, "in_progress", "Reopened"), {
    invalidate: INVALIDATE,
    success: (t) => `${t.reference} reopened`,
  });

  const overdue = task.is_overdue;
  const href = task.linked_item ? linkedItemHref(task.linked_item) : null;
  const canChangeStatus = task.allowed_transitions.some((t) => t.value !== "completed" && (t.value !== "cancelled" || canManage));

  return (
    <SlidePanel open onClose={onClose} title={task.reference} subtitle={`Created ${formatDateTime(task.created_at)}`}>
      {overdue && (
        <div className="bg-red-100 border border-red-300 rounded-lg p-4 flex items-start gap-3" role="alert">
          <AlertTriangle className="size-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">This task is overdue!</p>
            <p className="text-sm text-red-800 mt-1">Deadline was {formatDateTime(task.sla_deadline)}</p>
          </div>
        </div>
      )}

      {task.is_open && !task.owner && (
        <div className="bg-orange-100 border border-orange-300 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-orange-900">Task is unassigned!</p>
            <p className="text-sm text-orange-800 mt-1">Assign an owner to proceed</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Task Type</p>
          <TaskTypeBadge type={task.task_type} label={task.task_type_display} />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Status</p>
          <TaskStatusBadge status={task.status} label={task.status_display} />
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-gray-700 mb-2">Linked Item</p>
        {task.linked_item ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-lg font-bold text-blue-900">{task.linked_item.reference}</p>
              <p className="text-sm text-blue-700">{linkedKindLabel(task.linked_item.kind)}</p>
            </div>
            {href && (
              <button
                type="button"
                onClick={() => router.push(href)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <ExternalLink className="size-4" />
                {task.linked_item.kind === "quote" ? "View Quote" : "View Order"}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-blue-700">Not linked to an order or quote</p>
        )}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">SLA Timer</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-600">Deadline</p>
            <p className="text-lg font-semibold text-gray-900">{formatDateTime(task.sla_deadline)}</p>
          </div>
          <SlaTimer task={task} now={now} />
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700">Assigned Owner</p>
          {canEdit && task.is_open && (
            <button type="button" onClick={() => setEditingOwner(!editingOwner)} className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1">
              <Edit2 className="size-3" />
              {editingOwner ? "Cancel" : "Change"}
            </button>
          )}
        </div>
        {editingOwner ? (
          <div className="space-y-2">
            <Select aria-label="Select owner" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={owners.isPending} className="px-3">
              <option value="">{owners.isPending ? "Loading staff…" : "Unassigned"}</option>
              {owners.data?.map((o) => (
                <option key={o.id} value={o.id}>{o.full_name}{o.role ? ` — ${o.role}` : ""}</option>
              ))}
            </Select>
            <Button className="w-full text-sm" onClick={() => assign.mutate(undefined)} loading={assign.isPending} disabled={owner === (task.owner ? String(task.owner.id) : "")}>
              Save Owner
            </Button>
          </div>
        ) : task.owner ? (
          <div className="flex items-center gap-3">
            <div className="size-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">{task.owner.full_name.charAt(0)}</div>
            <div>
              <p className="font-medium text-gray-900">{task.owner.full_name}</p>
              {task.owner.role && <p className="text-sm text-gray-600">{task.owner.role}</p>}
            </div>
          </div>
        ) : (
          <p className="text-orange-600 font-medium">Unassigned - Assign someone to proceed</p>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Description</p>
        <p className="text-gray-900 whitespace-pre-line">{task.description}</p>
      </div>

      {task.notes.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Internal Notes</p>
          <div className="space-y-2">
            {task.notes.map((n) => (
              <div key={n.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <MessageSquare className="size-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 whitespace-pre-line">{n.body}</p>
                    <p className="text-xs text-gray-500 mt-1">{n.actor?.full_name ?? "System"} · {formatDateTime(n.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {canEdit && (
        <div>
          <label htmlFor="task-note" className="block text-sm font-semibold text-gray-700 mb-2">Add Internal Note</label>
          <div className="space-y-2">
            <Textarea
              id="task-note"
              value={newNote}
              onChange={(e) => {
                setNewNote(e.target.value);
                setNoteError(undefined);
              }}
              placeholder="Add a note about this task..."
              className="px-3 min-h-[80px]"
            />
            {noteError && <p className="text-xs text-red-600">{noteError}</p>}
            <button
              type="button"
              onClick={() => (newNote.trim() ? addNote.mutate(undefined) : setNoteError("Write a note first."))}
              disabled={addNote.isPending}
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium disabled:bg-gray-300"
            >
              {addNote.isPending ? "Adding…" : "Add Note"}
            </button>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-200">
          {task.is_open ? (
            <>
              <Button size="lg" className="px-4" onClick={() => setStatusOpen(true)} disabled={!canChangeStatus}>Change Status</Button>
              <Button size="lg" variant="success" className="px-4" onClick={() => complete.mutate(undefined)} loading={complete.isPending}>
                {!complete.isPending && <CheckCircle2 className="size-5" />}
                Mark as Completed
              </Button>
            </>
          ) : canManage ? (
            <Button size="lg" className="col-span-2" onClick={() => reopen.mutate(undefined)} loading={reopen.isPending}>
              <RotateCcw className="size-5" /> Reopen Task
            </Button>
          ) : (
            <p className="col-span-2 text-sm text-gray-500">This task is {task.status_display.toLowerCase()}. A manager can reopen it.</p>
          )}
        </div>
      )}

      <StatusDialog task={task} open={statusOpen} onClose={() => setStatusOpen(false)} canManage={canManage} />
    </SlidePanel>
  );
}
