"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Dropdown, Label, type ButtonProps } from "@heroui/react";
import { Layers } from "lucide-react";
import { useAppTranslation } from "@/app/i18n/hooks";
import type { DrawioPageInfo } from "@/app/lib/storage/page-metadata";

export interface PageSelectorButtonProps {
  pages: DrawioPageInfo[];
  selectedPageIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onRequestRefresh?: () => Promise<string | null>;
  isDisabled?: boolean;
  isIconOnly?: boolean;
}

/**
 * 页面选择器按钮（Milestone M5：受控组件）
 *
 * - 使用 HeroUI v3 Dropdown + Dropdown.Menu
 * - 支持多选，允许取消到 0 个页面（发送时由上层拦截）
 * - 页面解析与选中状态由上层（ChatSidebar）管理
 */
export default function PageSelectorButton({
  pages,
  selectedPageIds,
  onSelectionChange,
  onRequestRefresh,
  isDisabled,
  isIconOnly,
}: PageSelectorButtonProps) {
  const { t } = useAppTranslation("chat");
  const [isOpen, setIsOpen] = useState(false);
  const suppressNextCloseRef = useRef(false);
  const openRequestSeqRef = useRef(0);

  useEffect(() => {
    if (isDisabled && isOpen) {
      openRequestSeqRef.current += 1;
      setIsOpen(false);
    }
  }, [isDisabled, isOpen]);

  const total = pages.length;
  const isAllSelected =
    total > 0 && pages.every((page) => selectedPageIds.has(page.id));
  const selectedCount = isAllSelected ? total : selectedPageIds.size;
  const isNoneSelected = total > 0 && selectedCount === 0;

  let buttonVariant: ButtonProps["variant"] = "primary";
  if (isAllSelected) buttonVariant = "secondary";
  else if (isNoneSelected) buttonVariant = "danger";

  const buttonLabel = isAllSelected
    ? t("pageSelector.allPagesLabel", `页面: ${t("pageSelector.allPages")}`)
    : t("pageSelector.selectedPages", { selected: selectedCount, total });
  const tooltip = t("pageSelector.tooltip");

  const allPageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const page of pages) ids.add(page.id);
    return ids;
  }, [pages]);

  const selectAll = useCallback(
    () => onSelectionChange(new Set(allPageIds)),
    [allPageIds, onSelectionChange],
  );

  const suppressNextClose = useCallback(() => {
    suppressNextCloseRef.current = true;
    queueMicrotask(() => {
      suppressNextCloseRef.current = false;
    });
  }, []);

  const deselectAll = useCallback(
    () => onSelectionChange(new Set()),
    [onSelectionChange],
  );

  const handleToggleAll = useCallback(() => {
    suppressNextClose();
    if (isAllSelected) {
      deselectAll();
    } else {
      selectAll();
    }
  }, [isAllSelected, selectAll, deselectAll, suppressNextClose]);

  const openWithRefresh = useCallback(async () => {
    const requestSeq = openRequestSeqRef.current + 1;
    openRequestSeqRef.current = requestSeq;

    try {
      await onRequestRefresh?.();
    } catch {
      // 刷新失败时仍允许打开，避免阻塞交互（上层会回退到默认页面集合）。
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    if (openRequestSeqRef.current !== requestSeq) return;
    if (isDisabled) return;
    setIsOpen(true);
  }, [isDisabled, onRequestRefresh]);

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (isDisabled) {
          openRequestSeqRef.current += 1;
          setIsOpen(false);
          return;
        }

        if (!open && suppressNextCloseRef.current) {
          suppressNextCloseRef.current = false;
          return;
        }

        if (!open) {
          openRequestSeqRef.current += 1;
          setIsOpen(false);
          return;
        }

        void openWithRefresh();
      }}
    >
      <Button
        type="button"
        size="sm"
        variant={buttonVariant}
        className="page-selector-button"
        aria-label={t("pageSelector.ariaLabel")}
        isDisabled={isDisabled}
        isIconOnly={isIconOnly}
      >
        <span className="inline-flex items-center gap-2">
          <Layers size={16} aria-hidden />
          <span className="page-selector-button__label">{buttonLabel}</span>
        </span>
      </Button>
      <Dropdown.Popover placement="top start" className="min-w-[220px]">
        <div className="page-selector-hint">{tooltip}</div>
        <div className="px-2 pt-2">
          <Button
            type="button"
            size="sm"
            variant="tertiary"
            className="w-full justify-start"
            onPress={handleToggleAll}
            isDisabled={isDisabled}
            aria-label={
              isAllSelected
                ? t("pageSelector.deselectAll")
                : t("pageSelector.selectAll")
            }
          >
            {isAllSelected
              ? t("pageSelector.deselectAll")
              : t("pageSelector.selectAll")}
          </Button>
        </div>

        <Dropdown.Menu
          aria-label={t("pageSelector.togglePage")}
          className="page-selector-menu"
          selectionMode="multiple"
          selectedKeys={selectedPageIds}
          onSelectionChange={(keys) => {
            // HeroUI/React Aria MenuTrigger 会在选择项后默认关闭，这里做一次拦截以支持多选连续操作。
            suppressNextClose();

            if (keys === "all") {
              selectAll();
              return;
            }

            const next = new Set<string>();
            for (const key of keys) next.add(String(key));
            onSelectionChange(next);
          }}
        >
          {pages.map((page) => (
            <Dropdown.Item
              key={page.id}
              id={page.id}
              textValue={`${page.index + 1}. ${page.name}`}
            >
              <Dropdown.ItemIndicator type="checkmark" />
              <Label>{`${page.index + 1}. ${page.name}`}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
