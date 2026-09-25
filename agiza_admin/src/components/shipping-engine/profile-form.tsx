"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { engine, HANDLING_OPTIONS, PROFILE_TYPES, type ShippingProfile } from "@/lib/api/services/shipping-engine";

import { applyFieldErrors, useEngineMutation } from "./hooks";
import { Btn, EngineModal, FormField, Input, Select, Textarea } from "./ui";

const schema = z.object({
  name: z.string().trim().min(1, "Profile name is required").max(120),
  description: z.string(),
  type: z.enum(["standard", "specialized", "restricted", "oversized", "manual"]),
  handling: z.array(z.string()),
  notes: z.string(),
  status: z.enum(["active", "inactive"]),
});
type Values = z.infer<typeof schema>;
const EMPTY: Values = { name: "", description: "", type: "standard", handling: [], notes: "", status: "active" };

/** Create / edit a shipping profile (design: CreateProfileForm). */
export function ProfileForm({ open, onClose, profile }: { open: boolean; onClose: () => void; profile?: ShippingProfile | null }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    form.reset(
      profile
        ? { name: profile.name, description: profile.description, type: profile.type, handling: profile.handling, notes: profile.notes, status: profile.status }
        : EMPTY,
    );
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile?.id]);

  const mutation = useEngineMutation(
    (v: Values) => (profile ? engine.profiles.update(profile.id, v) : engine.profiles.create(v)),
    { success: profile ? "Profile updated" : "Profile created", onSuccess: onClose },
  );
  const submit = form.handleSubmit((v) =>
    mutation.mutate(v, { onError: (err) => setFormError(applyFieldErrors(err, form.setError, Object.keys(EMPTY))) }),
  );
  const { errors } = form.formState;

  return (
    <EngineModal
      open={open}
      onClose={onClose}
      title={profile ? `Edit Profile — ${profile.name}` : "Create Shipping Profile"}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={submit} loading={mutation.isPending}>
            {profile ? "Save Profile" : "Create Profile"}
          </Btn>
        </>
      }
    >
      {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
      <FormField label="Profile Name" required error={errors.name?.message} htmlFor="profile-name">
        <Input id="profile-name" placeholder="e.g. Drone — Special Air Cargo" invalid={!!errors.name} {...form.register("name")} />
      </FormField>
      <FormField label="Description">
        <Textarea rows={2} placeholder="Describe what products this profile applies to..." {...form.register("description")} />
      </FormField>
      <FormField label="Shipping Type" required>
        <Select {...form.register("type")}>
          {PROFILE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Special Handling Requirements" hint="Check all that apply to products in this profile">
        <Controller
          control={form.control}
          name="handling"
          render={({ field }) => (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {HANDLING_OPTIONS.map((h) => (
                <label key={h.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600"
                    checked={field.value.includes(h.value)}
                    onChange={(e) =>
                      field.onChange(e.target.checked ? [...field.value, h.value] : field.value.filter((x) => x !== h.value))
                    }
                  />
                  {h.label}
                </label>
              ))}
            </div>
          )}
        />
      </FormField>
      <FormField label="Restrictions / Notes">
        <Textarea rows={2} placeholder="Any additional notes or restrictions for this profile..." {...form.register("notes")} />
      </FormField>
      <FormField label="Status" required>
        <Select {...form.register("status")}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </FormField>
    </EngineModal>
  );
}
