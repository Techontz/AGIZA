"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api/client";
import { authService } from "@/lib/api/services/auth";

const schema = z
  .object({
    current_password: z.string().min(1, "Enter your current password"),
    new_password: z.string().min(10, "Use at least 10 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

type Values = z.infer<typeof schema>;

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { current_password: "", new_password: "", confirm: "" } });
  const mutation = useMutation({
    mutationFn: (v: Values) => authService.changePassword(v.current_password, v.new_password),
    onSuccess: () => {
      toast.success("Password changed. Please sign in with your new password.");
      window.location.assign("/login");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 400) {
        for (const [field, message] of Object.entries(err.fieldErrors)) {
          if (field === "current_password" || field === "new_password") form.setError(field, { message });
        }
      } else {
        toast.error(err instanceof Error ? err.message : "Could not change password");
      }
    },
  });

  const close = () => {
    form.reset();
    onClose();
  };
  const { errors } = form.formState;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Change Password"
      size="md"
      footer={
        <>
          <Button className="flex-1" loading={mutation.isPending} onClick={form.handleSubmit((v) => mutation.mutate(v))}>
            Update Password
          </Button>
          <Button variant="muted" onClick={close}>
            Cancel
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
        <Field label="Current Password" required error={errors.current_password?.message} htmlFor="cp-current">
          <Input id="cp-current" type="password" autoComplete="current-password" {...form.register("current_password")} />
        </Field>
        <Field label="New Password" required error={errors.new_password?.message} hint="At least 10 characters" htmlFor="cp-new">
          <Input id="cp-new" type="password" autoComplete="new-password" {...form.register("new_password")} />
        </Field>
        <Field label="Confirm New Password" required error={errors.confirm?.message} htmlFor="cp-confirm">
          <Input id="cp-confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
        </Field>
        <p className="text-xs text-gray-500">You will be signed out of all devices after changing your password.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
