"use client";

import { useCallback, useMemo } from "react";
import { AlertDialog, Button, Spinner } from "@heroui/react";
import { useAlertDialogInternal } from "./AlertDialogProvider";
import { useI18n } from "@/app/i18n/hooks";
import { createLogger } from "@/lib/logger";

const logger = createLogger("GlobalAlertDialog");

const ACTION_VARIANT_BY_STATUS: Record<
  "danger" | "warning",
  "danger" | "primary"
> = {
  danger: "danger",
  warning: "primary",
};

export default function GlobalAlertDialog() {
  const { t } = useI18n();
  const { state, dispatch } = useAlertDialogInternal();

  const defaultActionLabel = useMemo(() => t("actions.confirm", "确认"), [t]);
  const defaultCancelLabel = useMemo(() => t("actions.cancel", "取消"), [t]);
  const processingLabel = useMemo(
    () => t("actions.processing", "执行中..."),
    [t],
  );

  const handleClose = useCallback(() => {
    dispatch({ type: "CLOSE" });
  }, [dispatch]);

  const handleCancel = useCallback(() => {
    if (state.isProcessing) return;
    state.onCancel?.();
    handleClose();
  }, [handleClose, state]);

  const handleAction = useCallback(async () => {
    if (!state.onAction) {
      handleClose();
      return;
    }

    dispatch({ type: "START_PROCESSING" });
    try {
      await state.onAction();
      handleClose();
    } catch (error) {
      logger.error("[GlobalAlertDialog] action failed", error);
      dispatch({ type: "STOP_PROCESSING" });
    }
  }, [dispatch, handleClose, state]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        handleCancel();
      }
    },
    [handleCancel],
  );

  const actionLabel = state.actionLabel ?? defaultActionLabel;
  const cancelLabel = state.cancelLabel ?? defaultCancelLabel;
  const actionVariant = ACTION_VARIANT_BY_STATUS[state.status] ?? "primary";

  return (
    <AlertDialog isOpen={state.isOpen} onOpenChange={handleOpenChange}>
      {/* 受控模式下仍需要 Trigger，隐藏即可 */}
      <AlertDialog.Trigger className="global-alert-dialog__trigger" />

      <AlertDialog.Container
        placement="center"
        backdropClassName="global-alert-dialog__backdrop"
        className="global-alert-dialog__container"
        isDismissable={state.isDismissable}
        isKeyboardDismissDisabled={!state.isDismissable}
      >
        <AlertDialog.Dialog
          className={`global-alert-dialog__dialog global-alert-dialog__dialog--${state.status}`}
        >
          <AlertDialog.Header className="global-alert-dialog__header">
            <AlertDialog.Icon
              status={state.status}
              className="global-alert-dialog__icon"
            />
            <AlertDialog.Heading className="global-alert-dialog__title">
              {state.title}
            </AlertDialog.Heading>
          </AlertDialog.Header>

          <AlertDialog.Body className="global-alert-dialog__body">
            <p className="global-alert-dialog__description">
              {state.description}
            </p>
          </AlertDialog.Body>

          <AlertDialog.Footer className="global-alert-dialog__footer">
            <Button
              variant="tertiary"
              onPress={handleCancel}
              isDisabled={state.isProcessing}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={actionVariant}
              onPress={handleAction}
              isDisabled={state.isProcessing}
            >
              {state.isProcessing ? (
                <span className="global-alert-dialog__action-loading">
                  <Spinner size="sm" />
                  <span>{processingLabel}</span>
                </span>
              ) : (
                actionLabel
              )}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog>
  );
}
