"use client";

import type { ProviderType } from "@/app/types/chat";
import { getModelIcon } from "@/app/lib/model-icons";

interface ModelIconProps {
  modelId?: string | null;
  modelName?: string | null;
  providerId?: string | null;
  providerType?: ProviderType | null;
  size?: number;
  className?: string;
}

export function ModelIcon({
  modelId,
  modelName,
  providerId,
  providerType,
  size = 16,
  className,
}: ModelIconProps) {
  const { Icon, alt } = getModelIcon(
    modelId,
    modelName,
    providerId,
    providerType,
  );
  const wrapperClass = [
    "inline-flex items-center justify-center rounded-md text-foreground",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={wrapperClass}
      style={{ width: size, height: size }}
      role="img"
      aria-label={alt}
      title={alt}
    >
      <Icon size={size} color="currentColor" aria-hidden />
      <span className="sr-only">{alt}</span>
    </span>
  );
}

export default ModelIcon;
