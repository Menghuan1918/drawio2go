"use client";

import React from "react";
import { Button, Card, Disclosure } from "@heroui/react";
import {
  Clock,
  Key,
  GitBranch,
  RotateCcw,
  Download,
  ChevronDown,
} from "lucide-react";
import { materializeVersionXml } from "@/app/lib/storage/xml-version-engine";
import { useStorageXMLVersions } from "@/app/hooks/useStorageXMLVersions";
import type { XMLVersion } from "@/app/lib/storage/types";

interface VersionCardProps {
  version: XMLVersion;
  isLatest?: boolean;
  onRestore?: (versionId: string) => void;
  defaultExpanded?: boolean;
}

/**
 * 版本卡片组件 - 紧凑折叠模式
 * 默认显示折叠视图(版本号+徽章+时间),点击展开查看完整信息
 */
export function VersionCard({
  version,
  isLatest,
  onRestore,
  defaultExpanded = false,
}: VersionCardProps) {
  const [isExporting, setIsExporting] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const { getXMLVersion } = useStorageXMLVersions();

  const versionLabel = `v${version.semantic_version}`;
  const diffLabel = version.is_keyframe
    ? "关键帧快照"
    : `Diff 链 +${version.diff_chain_depth}`;
  const diffIcon = version.is_keyframe ? (
    <Key className="w-3.5 h-3.5" />
  ) : (
    <GitBranch className="w-3.5 h-3.5" />
  );

  // 格式化创建时间
  const createdAt = new Date(version.created_at).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // 处理回滚按钮点击
  const handleRestore = () => {
    if (onRestore) {
      try {
        onRestore(version.id);
      } catch (error) {
        console.error("回滚版本失败:", error);
      }
    }
  };

  // 处理导出按钮点击
  const handleExport = async () => {
    setIsExporting(true);
    try {
      // 恢复完整 XML
      const fullXml = await materializeVersionXml(version, (id) =>
        getXMLVersion(id),
      );

      // 创建下载
      const blob = new Blob([fullXml], { type: "text/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `diagram-v${version.semantic_version}.drawio`;
      a.click();
      URL.revokeObjectURL(url);

      console.log(`✅ 版本 ${version.semantic_version} 导出成功`);
    } catch (error) {
      console.error("导出版本失败:", error);
      alert("导出失败");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card.Root
      className={`version-card${isLatest ? " version-card--latest" : ""}${isExpanded ? " version-card--expanded" : " version-card--collapsed"}`}
      variant="secondary"
    >
      <Card.Content className="version-card__content">
        <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
          {/* 折叠状态的紧凑视图 - 始终显示 */}
          <Disclosure.Heading>
            <button
              type="button"
              className="version-card__trigger"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="version-card__compact-view">
                <div className="version-card__compact-left">
                  <span className="version-number">{versionLabel}</span>
                  {isLatest && <span className="latest-badge">最新</span>}
                  {version.is_keyframe ? (
                    <span className="keyframe-badge">
                      <Key className="w-2.5 h-2.5" />
                      关键帧
                    </span>
                  ) : (
                    <span className="diff-badge">
                      <GitBranch className="w-2.5 h-2.5" />
                      Diff +{version.diff_chain_depth}
                    </span>
                  )}
                </div>
                <div className="version-card__compact-right">
                  <span className="version-card__time">
                    <Clock className="w-3 h-3" />
                    {createdAt}
                  </span>
                  <ChevronDown
                    className={`version-card__chevron${isExpanded ? " rotated" : ""}`}
                  />
                </div>
              </div>
            </button>
          </Disclosure.Heading>

          {/* 展开状态的完整内容 */}
          <Disclosure.Content>
            <div className="version-card__expanded-content">
              {version.name && version.name !== version.semantic_version && (
                <h4 className="version-card__name">{version.name}</h4>
              )}

              {version.description && (
                <p className="version-card__description">
                  {version.description}
                </p>
              )}

              <div className="version-card__meta">
                <div className="version-card__meta-item">
                  {diffIcon}
                  <span>{diffLabel}</span>
                </div>
                <div className="version-card__meta-item">
                  <Clock className="w-3 h-3" />
                  <span>{createdAt}</span>
                </div>
              </div>

              <div className="version-card__actions">
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={handleExport}
                  isDisabled={isExporting}
                  aria-label={`导出 ${versionLabel}`}
                >
                  <Download className="w-3.5 h-3.5" />
                  导出
                </Button>

                {onRestore && (
                  <Button size="sm" variant="secondary" onPress={handleRestore}>
                    <RotateCcw className="w-3.5 h-3.5" />
                    回滚
                  </Button>
                )}
              </div>
            </div>
          </Disclosure.Content>
        </Disclosure>
      </Card.Content>
    </Card.Root>
  );
}
