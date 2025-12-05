export interface AlertDialogState {
  isOpen: boolean;
  status: "danger" | "warning";
  title: string;
  description: string;
  actionLabel?: string;
  cancelLabel?: string;
  onAction?: () => void | Promise<void>;
  onCancel?: () => void;
  isDismissable?: boolean;
}

export type AlertDialogPayload = Omit<AlertDialogState, "isOpen">;

export interface AlertDialogContextValue {
  open: (payload: AlertDialogPayload) => void;
  close: () => void;
}
