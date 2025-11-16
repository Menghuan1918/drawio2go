"use client";

import React from "react";
import { Card } from "@heroui/react";
import { Activity, Clock, Sparkles } from "lucide-react";
import { WIP_VERSION } from "@/app/lib/storage/constants";
import type { XMLVersion } from "@/app/lib/storage/types";

interface WIPIndicatorProps {
  projectUuid: string;
  versions: XMLVersion[];
}

/**
 * WIP 指示器组件
 * 显示当前活跃工作区的信息，包括版本号和最后更新时间
 */
export function WIPIndicator({ versions }: WIPIndicatorProps) {
  // 监听 WIP 更新事件，触发版本列表刷新
  React.useEffect(() => {
    const handleWIPUpdate = () => {
      // 触发版本列表更新
      window.dispatchEvent(new Event("version-updated"));
    };

    window.addEventListener("wip-updated", handleWIPUpdate);
    return () => window.removeEventListener("wip-updated", handleWIPUpdate);
  }, []);

  // 查找 WIP 版本 (0.0.0)
  const wipVersion = versions.find((v) => v.semantic_version === WIP_VERSION);

  // 如果没有 WIP 版本，不显示组件
  if (!wipVersion) {
    return null;
  }

  // 格式化最后修改时间
  const lastModified = new Date(wipVersion.created_at).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const wipSemver =
    wipVersion.semantic_version === WIP_VERSION
      ? "草稿序列"
      : `v${wipVersion.semantic_version}`;

  return (
    <Card.Root className="wip-indicator" variant="secondary">
      <Card.Content className="wip-indicator__body">
        <div className="wip-indicator__top">
          <div className="wip-icon">
            <Activity className="w-5 h-5" />
          </div>
          <div className="wip-indicator__titles">
            <div className="wip-indicator__status">
              <span className="wip-badge">WIP</span>
              <span className="wip-indicator__label">活跃工作区</span>
              <span className="wip-indicator__dot" />
              <span className="wip-indicator__version">{wipSemver}</span>
            </div>
            <p className="wip-indicator__description">
              当前正在编辑的内容将实时保存在此草稿中
            </p>
          </div>
        </div>

        <div className="wip-indicator__meta">
          <div className="wip-indicator__meta-item">
            <Clock className="w-3.5 h-3.5" />
            <span>最后更新 · {lastModified}</span>
          </div>
          <div className="wip-indicator__meta-item">
            <Sparkles className="w-3.5 h-3.5" />
            <span>实时保存已开启</span>
          </div>
        </div>
      </Card.Content>
    </Card.Root>
  );
}
