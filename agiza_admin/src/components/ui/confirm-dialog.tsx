"use client";

import { Button } from "./button";
import { Modal } from "./modal";

/** Confirmation for irreversible or consequential actions. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "primary",
  pending,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger" | "success";
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant={tone} className="flex-1" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      {message && <div className="text-gray-700">{message}</div>}
      {children}
    </Modal>
  );
}
