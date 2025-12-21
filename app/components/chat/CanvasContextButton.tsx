"use client";

import {
  Button,
  TooltipContent,
  TooltipRoot,
  type ButtonProps,
} from "@heroui/react";
import { SquareMousePointer } from "lucide-react";
import { useAppTranslation } from "@/app/i18n/hooks";

export interface CanvasContextButtonProps extends Omit<
  ButtonProps,
  "children" | "variant" | "aria-label" | "aria-pressed" | "onPress"
> {
  enabled: boolean;
  onPress?: () => void;
}

export default function CanvasContextButton({
  enabled,
  onPress,
  ...buttonProps
}: CanvasContextButtonProps) {
  const { t } = useAppTranslation("chat");
  const label = t("canvasContext");

  return (
    <TooltipRoot delay={0}>
      <Button
        type="button"
        size="sm"
        variant={enabled ? "primary" : "secondary"}
        aria-label={label}
        aria-pressed={enabled}
        onPress={onPress}
        {...buttonProps}
      >
        <SquareMousePointer size={16} aria-hidden />
        {label}
      </Button>
      <TooltipContent placement="top">
        <p>{t("canvasContextTooltip")}</p>
      </TooltipContent>
    </TooltipRoot>
  );
}
