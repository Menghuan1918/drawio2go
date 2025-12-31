"use client";

import { useCallback, useState } from "react";
import {
  Button,
  Description,
  Dropdown,
  Input,
  Label,
  TextField,
} from "@heroui/react";
import { ChevronDown, RotateCcw } from "lucide-react";
import Image from "next/image";

import ConfirmDialog from "../common/ConfirmDialog";
import { useAppTranslation } from "@/app/i18n/hooks";
import type { DrawioTheme } from "@/app/lib/config-utils";

export interface DrawioSettingsPanelProps {
  drawioBaseUrl: string;
  drawioIdentifier: string;
  drawioTheme: DrawioTheme;
  drawioUrlParams: string;
  drawioBaseUrlError?: string;
  drawioIdentifierError?: string;
  onDrawioBaseUrlChange: (value: string) => void;
  onDrawioIdentifierChange: (value: string) => void;
  onDrawioThemeChange: (value: DrawioTheme) => void;
  onDrawioUrlParamsChange: (value: string) => void;
  onResetDrawioBaseUrl: () => void | Promise<void>;
  onResetDrawioIdentifier: () => void | Promise<void>;
  onResetDrawioUrlParams: () => void | Promise<void>;
}

const THEME_OPTIONS: Array<{
  key: DrawioTheme;
  labelKey: string;
  descriptionKey: string;
}> = [
  {
    key: "kennedy",
    labelKey: "drawio.theme.options.kennedy",
    descriptionKey: "drawio.theme.descriptions.kennedy",
  },
  {
    key: "min",
    labelKey: "drawio.theme.options.min",
    descriptionKey: "drawio.theme.descriptions.min",
  },
  {
    key: "atlas",
    labelKey: "drawio.theme.options.atlas",
    descriptionKey: "drawio.theme.descriptions.atlas",
  },
  {
    key: "sketch",
    labelKey: "drawio.theme.options.sketch",
    descriptionKey: "drawio.theme.descriptions.sketch",
  },
  {
    key: "simple",
    labelKey: "drawio.theme.options.simple",
    descriptionKey: "drawio.theme.descriptions.simple",
  },
];

export default function DrawioSettingsPanel({
  drawioBaseUrl,
  drawioIdentifier,
  drawioTheme,
  drawioUrlParams,
  drawioBaseUrlError,
  drawioIdentifierError,
  onDrawioBaseUrlChange,
  onDrawioIdentifierChange,
  onDrawioThemeChange,
  onDrawioUrlParamsChange,
  onResetDrawioBaseUrl,
  onResetDrawioIdentifier,
  onResetDrawioUrlParams,
}: DrawioSettingsPanelProps) {
  const { t } = useAppTranslation("settings");
  const [isResetBaseUrlOpen, setIsResetBaseUrlOpen] = useState(false);
  const [isResetIdentifierOpen, setIsResetIdentifierOpen] = useState(false);
  const [isResetUrlParamsOpen, setIsResetUrlParamsOpen] = useState(false);

  const handleThemeChange = useCallback(
    (nextTheme: DrawioTheme) => {
      onDrawioThemeChange(nextTheme);
    },
    [onDrawioThemeChange],
  );

  return (
    <div className="settings-panel flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="section-title">{t("drawio.title")}</h3>
        <p className="section-description">{t("drawio.description")}</p>
      </div>

      <div className="drawio-theme-section">
        <div className="flex flex-col gap-1">
          <Label className="text-sm font-semibold text-foreground">
            {t("drawio.theme.label")}
          </Label>
          <Description className="text-sm text-default-500">
            {t("drawio.theme.description")}
          </Description>
        </div>

        <Dropdown>
          <div className="drawio-theme-selector">
            {(() => {
              const currentTheme = THEME_OPTIONS.find(
                (th) => th.key === drawioTheme,
              );
              if (!currentTheme) return null;
              return (
                <div
                  className="drawio-theme-card drawio-theme-card--selected"
                  aria-label={`${t(currentTheme.labelKey)} - ${t(currentTheme.descriptionKey)}`}
                >
                  <span className="drawio-theme-card__thumbnail">
                    <Image
                      src={`/images/drawio-themes/${currentTheme.key}.svg`}
                      alt=""
                      aria-hidden="true"
                      width={80}
                      height={60}
                    />
                  </span>
                  <span className="drawio-theme-card__info">
                    <span className="drawio-theme-card__title">
                      {t(currentTheme.labelKey)}
                    </span>
                    <span className="drawio-theme-card__description">
                      {t(currentTheme.descriptionKey)}
                    </span>
                  </span>
                </div>
              );
            })()}
            <Dropdown.Trigger
              className="drawio-theme-dropdown-trigger"
              aria-label={t("drawio.theme.change")}
            >
              <ChevronDown className="size-4" />
            </Dropdown.Trigger>
          </div>
          <Dropdown.Popover className="min-w-[280px]">
            <Dropdown.Menu
              selectedKeys={new Set([drawioTheme])}
              selectionMode="single"
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as DrawioTheme;
                if (selected) handleThemeChange(selected);
              }}
            >
              {THEME_OPTIONS.map((theme) => (
                <Dropdown.Item
                  key={theme.key}
                  id={theme.key}
                  textValue={t(theme.labelKey)}
                >
                  <div className="flex items-center gap-3">
                    <span className="drawio-theme-dropdown-thumb">
                      <Image
                        src={`/images/drawio-themes/${theme.key}.svg`}
                        alt=""
                        aria-hidden="true"
                        width={48}
                        height={36}
                      />
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <Label className="text-sm">{t(theme.labelKey)}</Label>
                      <Description className="text-xs">
                        {t(theme.descriptionKey)}
                      </Description>
                    </div>
                  </div>
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>

      <TextField className="w-full">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-sm text-foreground">
              {t("drawio.baseUrl.label")}
            </Label>
            <Description className="text-sm text-default-500">
              {t("drawio.baseUrl.description")}
            </Description>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onPress={() => setIsResetBaseUrlOpen(true)}
            className="shrink-0"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t("drawio.baseUrl.reset")}
          </Button>
        </div>

        <Input
          value={drawioBaseUrl}
          onChange={(event) => onDrawioBaseUrlChange(event.target.value)}
          placeholder={t("drawio.baseUrl.placeholder")}
          aria-label={t("drawio.baseUrl.label")}
          className="mt-4 w-full"
        />

        <Description className="mt-2 text-sm text-danger">
          {t("drawio.baseUrl.warning")}
        </Description>

        {drawioBaseUrlError ? (
          <Description className="mt-2 text-sm text-danger">
            {drawioBaseUrlError}
          </Description>
        ) : null}
      </TextField>

      <TextField className="w-full">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-sm text-foreground">
              {t("drawio.identifier.label")}
            </Label>
            <Description className="text-sm text-default-500">
              {t("drawio.identifier.description")}
            </Description>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onPress={() => setIsResetIdentifierOpen(true)}
            className="shrink-0"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t("drawio.identifier.reset")}
          </Button>
        </div>

        <Input
          value={drawioIdentifier}
          onChange={(event) => onDrawioIdentifierChange(event.target.value)}
          placeholder={t("drawio.identifier.placeholder")}
          aria-label={t("drawio.identifier.label")}
          className="mt-4 w-full"
        />

        <Description className="mt-2 text-sm text-danger">
          {t("drawio.identifier.warning")}
        </Description>

        {drawioIdentifierError ? (
          <Description className="mt-2 text-sm text-danger">
            {drawioIdentifierError}
          </Description>
        ) : null}
      </TextField>

      <TextField className="w-full">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-sm text-foreground">
              {t("drawio.urlParams.label")}
            </Label>
            <Description className="text-sm text-default-500">
              {t("drawio.urlParams.description")}
            </Description>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onPress={() => setIsResetUrlParamsOpen(true)}
            className="shrink-0"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t("drawio.urlParams.reset")}
          </Button>
        </div>

        <Input
          value={drawioUrlParams}
          onChange={(event) => onDrawioUrlParamsChange(event.target.value)}
          placeholder={t("drawio.urlParams.placeholder")}
          aria-label={t("drawio.urlParams.label")}
          className="mt-4 w-full"
        />

        <Description className="mt-2 text-sm text-danger">
          {t("drawio.urlParams.warning")}
        </Description>
      </TextField>

      <ConfirmDialog
        isOpen={isResetBaseUrlOpen}
        onOpenChange={setIsResetBaseUrlOpen}
        title={t("drawio.baseUrl.resetTitle")}
        description={t("drawio.baseUrl.resetConfirm")}
        confirmText={t("common.confirm", { defaultValue: "Confirm" })}
        cancelText={t("common.cancel", { defaultValue: "Cancel" })}
        variant="danger"
        onConfirm={onResetDrawioBaseUrl}
      />

      <ConfirmDialog
        isOpen={isResetIdentifierOpen}
        onOpenChange={setIsResetIdentifierOpen}
        title={t("drawio.identifier.resetTitle")}
        description={t("drawio.identifier.resetConfirm")}
        confirmText={t("common.confirm", { defaultValue: "Confirm" })}
        cancelText={t("common.cancel", { defaultValue: "Cancel" })}
        variant="danger"
        onConfirm={onResetDrawioIdentifier}
      />

      <ConfirmDialog
        isOpen={isResetUrlParamsOpen}
        onOpenChange={setIsResetUrlParamsOpen}
        title={t("drawio.urlParams.label")}
        description={t("drawio.urlParams.resetConfirm")}
        confirmText={t("common.confirm", { defaultValue: "Confirm" })}
        cancelText={t("common.cancel", { defaultValue: "Cancel" })}
        variant="danger"
        onConfirm={onResetDrawioUrlParams}
      />
    </div>
  );
}
