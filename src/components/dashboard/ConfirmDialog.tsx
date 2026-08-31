"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";

/** A confirmation Modal with a standard Cancel / confirm footer. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      <div className="px-6 py-5 text-sm text-foreground">{children}</div>
      <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
