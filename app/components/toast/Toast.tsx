"use client";

import React from "react";
import { useEffect, useRef, useState, FocusEvent, KeyboardEvent } from "react";
import { Button, CloseButton } from "@heroui/react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Info,
  XCircle,
} from "lucide-react";
import type { Toast as ToastItem } from "@/app/types/toast";
import { useAppTranslation } from "@/app/i18n/hooks";

interface ToastRootProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  isLeaving?: boolean;
}

interface ToastIconProps {
  variant: ToastItem["variant"];
}

interface ToastContentProps {
  title?: string;
  description: string;
}

interface ToastCloseProps {
  onPress: () => void;
  ariaLabel: string;
}

function ToastIcon({ variant }: ToastIconProps) {
  const iconProps = { size: 20, strokeWidth: 2.3, "aria-hidden": true };
  switch (variant) {
    case "success":
      return <CheckCircle2 {...iconProps} />;
    case "info":
      return <Info {...iconProps} />;
    case "warning":
      return <AlertTriangle {...iconProps} />;
    case "danger":
    default:
      return <XCircle {...iconProps} />;
  }
}

function ToastContent({ title, description }: ToastContentProps) {
  return (
    <div className="toast__content">
      {title ? <div className="toast__title">{title}</div> : null}
      <div className="toast__description">{description}</div>
    </div>
  );
}

function ToastClose({ onPress, ariaLabel }: ToastCloseProps) {
  return (
    <CloseButton
      aria-label={ariaLabel}
      onPress={onPress}
      className="toast__close"
    />
  );
}

function ToastRoot({
  toast,
  onDismiss,
  onPause,
  onResume,
  isLeaving = false,
}: ToastRootProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useAppTranslation("common");

  const closeLabel = t("toast.close", "Close notification");
  const copyLabel = t("toast.copy", "Copy notification");
  const copiedLabel = t("toast.copied", "Copied");
  const actionAriaLabel = toast.action?.ariaLabel ?? toast.action?.label;

  const role =
    toast.variant === "warning" || toast.variant === "danger"
      ? "alert"
      : "status";

  useEffect(() => {
    setIsMounted(true);

    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onDismiss(toast.id);
    }
  };

  const handleFocus = () => {
    onPause(toast.id);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      onResume(toast.id);
    }
  };

  return (
    <div
      className={`toast ${isMounted ? "toast--open" : ""} ${
        isLeaving ? "toast--leaving" : ""
      }`}
      role={role}
      tabIndex={0}
      data-variant={toast.variant}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => onPause(toast.id)}
      onMouseLeave={() => onResume(toast.id)}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <ToastIcon variant={toast.variant} />
      <ToastContent title={toast.title} description={toast.description} />
      <div className="toast__actions">
        {toast.action ? (
          <Button
            size="sm"
            variant="tertiary"
            aria-label={actionAriaLabel}
            onPress={async () => {
              try {
                await toast.action?.onPress();
              } catch {
                // UI 级交互失败保持静默，避免 toast 内二次 toast
              } finally {
                // 无论 action 成功还是失败，都关闭 toast
                onDismiss(toast.id);
              }
            }}
            className="toast__action"
          >
            {toast.action.label}
          </Button>
        ) : null}
        <Button
          isIconOnly
          size="sm"
          variant="tertiary"
          aria-label={copied ? copiedLabel : copyLabel}
          onPress={async () => {
            const text = toast.title
              ? `${toast.title}\n${toast.description}`
              : toast.description;

            const copyFallback = () => {
              try {
                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "absolute";
                textarea.style.left = "-9999px";
                document.body.appendChild(textarea);
                textarea.select();
                const succeeded = document.execCommand("copy");
                document.body.removeChild(textarea);
                return succeeded;
              } catch {
                return false;
              }
            };

            const copySucceeded = await (async () => {
              if (navigator?.clipboard?.writeText) {
                try {
                  await navigator.clipboard.writeText(text);
                  return true;
                } catch {
                  return copyFallback();
                }
              }

              return copyFallback();
            })();

            if (copySucceeded) {
              setCopied(true);
              if (copyTimeoutRef.current) {
                clearTimeout(copyTimeoutRef.current);
              }
              copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
            }
          }}
          className="toast__copy"
        >
          {copied ? (
            <Check size={18} aria-hidden />
          ) : (
            <Copy size={18} aria-hidden />
          )}
        </Button>
        <ToastClose
          onPress={() => onDismiss(toast.id)}
          ariaLabel={closeLabel}
        />
      </div>
    </div>
  );
}

export const Toast = Object.assign(ToastRoot, {
  Root: ToastRoot,
  Icon: ToastIcon,
  Content: ToastContent,
  Close: ToastClose,
});

export type {
  ToastRootProps,
  ToastIconProps,
  ToastContentProps,
  ToastCloseProps,
};
