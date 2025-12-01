"use client";

import { Description, Label, ListBox, Select } from "@heroui/react";
import { Languages } from "lucide-react";
import type { Key } from "react";
import type { Selection } from "react-aria-components";

import i18n from "@/app/i18n/client";
import {
  defaultLocale,
  localeDisplayNames,
  locales,
  type Locale,
} from "@/app/i18n/config";
import { useAppTranslation } from "@/app/i18n/hooks";

interface LanguageSwitcherProps {
  className?: string;
}

const extractSingleKey = (keys: Selection): string | null => {
  if (keys === "all") return null;
  const keyArray = [...keys];
  if (!keyArray.length) return null;
  const first = keyArray[0];
  if (typeof first === "number" || typeof first === "bigint") {
    return String(first);
  }
  return first as string;
};

const normalizeSelection = (keys: Selection | Key | null): Selection | null => {
  if (keys === null) return null;
  if (keys === "all") return "all";
  if (
    typeof keys === "string" ||
    typeof keys === "number" ||
    typeof keys === "bigint"
  ) {
    return new Set([keys]) as Selection;
  }
  return keys;
};

/**
 * 语言切换器
 * 使用 HeroUI Select 切换 en-US / zh-CN，并立即调用 i18n.changeLanguage 生效
 */
export default function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { t } = useAppTranslation("settings");

  const currentLanguage = i18n.language as Locale | undefined;
  const selectedLocale: Locale = locales.includes(currentLanguage as Locale)
    ? (currentLanguage as Locale)
    : defaultLocale;

  const handleChange = (keys: Selection) => {
    const key = extractSingleKey(keys);
    if (typeof key !== "string") return;

    const nextLocale = locales.includes(key as Locale)
      ? (key as Locale)
      : defaultLocale;

    if (nextLocale !== i18n.language) {
      void i18n.changeLanguage(nextLocale);
    }
  };

  return (
    <Select
      className={className}
      selectedKey={selectedLocale}
      onSelectionChange={(keys) => {
        const selection = normalizeSelection(keys);
        if (!selection) return;
        handleChange(selection);
      }}
      aria-label={t("general.language.label")}
    >
      <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Languages className="h-4 w-4 text-default-500" />
        {t("general.language.label")}
      </Label>

      <Select.Trigger className="mt-3 flex w-full items-center justify-between rounded-md border border-default-200 bg-content1 px-3 py-2 text-left text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 hover:border-primary">
        <Select.Value className="text-sm leading-6 text-foreground" />
        <Select.Indicator className="text-default-500" />
      </Select.Trigger>

      <Select.Content className="rounded-2xl border border-default-200 bg-content1 p-2 shadow-2xl">
        <ListBox className="flex flex-col gap-1">
          {locales.map((locale) => (
            <ListBox.Item
              key={locale}
              id={locale}
              textValue={localeDisplayNames[locale]}
              className="select-item flex items-center justify-between rounded-xl text-sm text-foreground hover:bg-primary-50"
            >
              {localeDisplayNames[locale]}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Content>

      <Description className="mt-3">
        {t("general.language.description")}
      </Description>
    </Select>
  );
}
