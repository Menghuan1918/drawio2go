"use client";

import {
  Button,
  Card,
  Description,
  Label,
  Popover,
  type ButtonProps,
} from "@heroui/react";
import { Route, SquareMousePointer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAppTranslation } from "@/app/i18n/hooks";

export interface CanvasContextButtonProps extends Omit<
  ButtonProps,
  "children" | "variant" | "aria-label" | "aria-pressed" | "onPress"
> {
  isCanvasContextEnabled: boolean;
  onCanvasContextChange: (enabled: boolean) => void;
  isLayoutCheckEnabled: boolean;
  onLayoutCheckChange: (enabled: boolean) => void;
}

export default function CanvasContextButton({
  isCanvasContextEnabled,
  onCanvasContextChange,
  isLayoutCheckEnabled,
  onLayoutCheckChange,
  ...buttonProps
}: CanvasContextButtonProps) {
  const { t } = useAppTranslation("chat");
  const [isOpen, setIsOpen] = useState(false);
  const enabledCount = useMemo(
    () =>
      Number(Boolean(isCanvasContextEnabled)) +
      Number(Boolean(isLayoutCheckEnabled)),
    [isCanvasContextEnabled, isLayoutCheckEnabled],
  );

  const label = t("canvasEnhancements.buttonLabel", {
    count: enabledCount,
    defaultValue: `画布增强(${enabledCount})`,
  });
  const { className, ...restButtonProps } = buttonProps;

  useEffect(() => {
    if (restButtonProps.isDisabled && isOpen) {
      setIsOpen(false);
    }
  }, [isOpen, restButtonProps.isDisabled]);

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (restButtonProps.isDisabled) {
          setIsOpen(false);
          return;
        }
        setIsOpen(open);
      }}
    >
      <Button
        type="button"
        size="sm"
        variant={enabledCount > 0 ? "primary" : "secondary"}
        aria-label={label}
        className={["canvas-context-button", className]
          .filter(Boolean)
          .join(" ")}
        {...restButtonProps}
      >
        <SquareMousePointer size={16} aria-hidden />
        <span className="canvas-context-button__label">{label}</span>
      </Button>

      <Popover.Content
        placement="top start"
        className="canvas-enhancements-popover"
      >
        <Popover.Arrow />
        <Popover.Dialog className="canvas-enhancements-dialog">
          <div className="canvas-enhancements-list">
            <Card.Root
              role="button"
              tabIndex={restButtonProps.isDisabled ? -1 : 0}
              aria-pressed={isCanvasContextEnabled}
              className={[
                "canvas-enhancement-card",
                isCanvasContextEnabled && "canvas-enhancement-card--enabled",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (!restButtonProps.isDisabled) {
                  onCanvasContextChange(!isCanvasContextEnabled);
                }
              }}
              onKeyDown={(e) => {
                if (
                  !restButtonProps.isDisabled &&
                  (e.key === "Enter" || e.key === " ")
                ) {
                  e.preventDefault();
                  onCanvasContextChange(!isCanvasContextEnabled);
                }
              }}
            >
              <Card.Content className="canvas-enhancement-card__content">
                <span className="canvas-enhancement-card__header">
                  <SquareMousePointer size={18} aria-hidden="true" />
                  <Label className="canvas-enhancement-card__title">
                    {t("canvasContext")}
                  </Label>
                </span>
                <Description className="canvas-enhancement-card__description">
                  {t("canvasContextTooltip")}
                </Description>
              </Card.Content>
            </Card.Root>

            <Card.Root
              role="button"
              tabIndex={restButtonProps.isDisabled ? -1 : 0}
              aria-pressed={isLayoutCheckEnabled}
              className={[
                "canvas-enhancement-card",
                isLayoutCheckEnabled && "canvas-enhancement-card--enabled",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (!restButtonProps.isDisabled) {
                  onLayoutCheckChange(!isLayoutCheckEnabled);
                }
              }}
              onKeyDown={(e) => {
                if (
                  !restButtonProps.isDisabled &&
                  (e.key === "Enter" || e.key === " ")
                ) {
                  e.preventDefault();
                  onLayoutCheckChange(!isLayoutCheckEnabled);
                }
              }}
            >
              <Card.Content className="canvas-enhancement-card__content">
                <span className="canvas-enhancement-card__header">
                  <Route size={18} aria-hidden="true" />
                  <Label className="canvas-enhancement-card__title">
                    {t("layoutCheck.title", "布局检查")}
                  </Label>
                </span>
                <Description className="canvas-enhancement-card__description">
                  {t(
                    "layoutCheck.description",
                    "批量编辑完成后检测连接线是否与元素重叠，并在结果中附加 warning",
                  )}
                </Description>
              </Card.Content>
            </Card.Root>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
