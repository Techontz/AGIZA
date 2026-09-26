"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import {
  DEPARTMENT_OPTIONS,
  STAFF_LEVEL_OPTIONS,
  peopleApi,
  type Department,
  type StaffInput,
  type StaffMember,
} from "@/lib/api/services/people";
import type { StaffLevel } from "@/lib/api/types";

import { FormErrors, usePeopleAccess, usePeopleMutation, type Errors } from "./shared";

const FIELDS = ["full_name", "email", "phone", "staff_level", "department", "password"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRIVILEGED: StaffLevel[] = ["top_admin", "admin_l2"];

/** Readable temporary password from the browser's CSPRNG. */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}`;
}

/**
 * Add / edit a staff account. `driver` fixes the level to Driver (the Drivers
 * tab). Accounts are deactivated, never deleted.
 */
export function StaffFormModal({
  member,
  driver,
  onClose,
}: {
  member?: StaffMember | null;
  driver: boolean;
  onClose: () => void;
}) {
  const { me } = usePeopleAccess();
  const isTopAdmin = Boolean(me?.is_top_admin);
  const [form, setForm] = useState({
    full_name: member?.full_name ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    staff_level: member?.staff_level ?? (driver ? "driver" : "sales"),
    department: member?.department ?? (driver ? "delivery" : "sales"),
    password: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [confirmToggle, setConfirmToggle] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const noun = driver ? "Driver" : "Staff Member";
  const isSelf = Boolean(member && me && member.id === me.id);
  const levelLocked = Boolean(member && member.staff_level === "top_admin" && !isTopAdmin);

  const save = usePeopleMutation(
    (body: Partial<StaffInput>) => (member ? peopleApi.staff.update(member.id, body) : peopleApi.staff.create(body as StaffInput)),
    {
      success: (s) => (member ? `${s.full_name} updated` : `${s.full_name} added (${s.employee_id})`),
      onSuccess: onClose,
      setErrors,
    },
  );
  const toggle = usePeopleMutation((active: boolean) => peopleApi.staff.update(member!.id, { is_active: active }), {
    success: (s) => `${s.full_name} ${s.is_active ? "activated" : "deactivated"}`,
    onSuccess: () => {
      setConfirmToggle(false);
      onClose();
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    const email = form.email.trim().toLowerCase();
    if (!form.full_name.trim()) local.full_name = "Enter the full name.";
    if (!EMAIL_RE.test(email)) local.email = "Enter a valid email address.";
    if (!member && !form.password) local.password = "Set a temporary password.";
    setErrors(local);
    if (Object.keys(local).length) return;
    const body: Partial<StaffInput> = {
      full_name: form.full_name.trim(),
      email,
      phone: form.phone.trim(),
      department: form.department,
    };
    // Only send the level when it changes: Django re-validates privileged levels on every write.
    if (!levelLocked && (!member || form.staff_level !== member.staff_level)) body.staff_level = form.staff_level;
    if (form.password) body.password = form.password;
    save.mutate(body);
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={member ? `Edit ${noun}` : `Add New ${noun}`}
        footer={
          <>
            <Button type="submit" form="staff-form" size="lg" className="flex-1" loading={save.isPending}>
              {member ? "Save Changes" : `Add ${noun}`}
            </Button>
            {member && (
              <Button
                variant={member.is_active ? "outline" : "success"}
                size="lg"
                disabled={isSelf && member.is_active}
                title={isSelf && member.is_active ? "You cannot deactivate your own account" : undefined}
                onClick={() => setConfirmToggle(true)}
                className={member.is_active ? "text-red-600 border-red-200 hover:bg-red-50" : undefined}
              >
                {member.is_active ? "Deactivate" : "Activate"}
              </Button>
            )}
            <Button variant="muted" size="lg" onClick={onClose}>
              Cancel
            </Button>
          </>
        }
      >
        <form id="staff-form" onSubmit={submit} className="space-y-4" noValidate>
          {member && (
            <p className="text-sm text-gray-500">
              {member.employee_id} · {member.is_active ? "Active" : "Inactive"}
            </p>
          )}
          <FormErrors errors={errors} fields={FIELDS} />
          <Field label="Full Name" required htmlFor="s-name" error={errors.full_name}>
            <Input id="s-name" value={form.full_name} maxLength={150} onChange={(e) => set("full_name", e.target.value)} invalid={Boolean(errors.full_name)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email" required htmlFor="s-email" error={errors.email} hint="Used to sign in">
              <Input id="s-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} invalid={Boolean(errors.email)} />
            </Field>
            <Field label="Phone" htmlFor="s-phone" error={errors.phone}>
              <Input id="s-phone" type="tel" value={form.phone} maxLength={32} onChange={(e) => set("phone", e.target.value)} invalid={Boolean(errors.phone)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!driver && (
              <Field label="Staff Level" required htmlFor="s-level" error={errors.staff_level} hint={levelLocked ? "Only a Top Admin can change a Top Admin's level" : undefined}>
                <Select id="s-level" value={form.staff_level} disabled={levelLocked} onChange={(e) => set("staff_level", e.target.value as StaffLevel)}>
                  {STAFF_LEVEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} disabled={PRIVILEGED.includes(o.value) && !isTopAdmin && o.value !== member?.staff_level}>
                      {o.label}
                      {PRIVILEGED.includes(o.value) && !isTopAdmin ? " (Top Admin only)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Department" required htmlFor="s-dept" error={errors.department}>
              <Select id="s-dept" value={form.department} onChange={(e) => set("department", e.target.value as Department)}>
                {DEPARTMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label={member ? "Reset Password" : "Temporary Password"}
            required={!member}
            htmlFor="s-password"
            error={errors.password}
            hint={member ? "Leave blank to keep the current password" : "Share it securely; they can change it after signing in"}
          >
            <div className="flex gap-2">
              <Input
                id="s-password"
                type="text"
                autoComplete="new-password"
                spellCheck={false}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                invalid={Boolean(errors.password)}
                className="font-mono"
              />
              <Button variant="outline" onClick={() => set("password", generatePassword())} aria-label="Generate a password" title="Generate a password">
                <KeyRound className="size-4" />
                <span className="hidden sm:inline">Generate</span>
              </Button>
            </div>
          </Field>
        </form>
      </Modal>

      {member && (
        <ConfirmDialog
          open={confirmToggle}
          title={member.is_active ? `Deactivate ${member.full_name}?` : `Activate ${member.full_name}?`}
          message={
            member.is_active
              ? "They will no longer be able to sign in. Their history is kept and the account can be reactivated later."
              : "They will be able to sign in again with their existing password."
          }
          confirmLabel={member.is_active ? "Deactivate" : "Activate"}
          tone={member.is_active ? "danger" : "success"}
          pending={toggle.isPending}
          onConfirm={() => toggle.mutate(!member.is_active)}
          onClose={() => setConfirmToggle(false)}
        />
      )}
    </>
  );
}
