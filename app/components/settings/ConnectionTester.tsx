"use client";

import { useState, type ReactNode } from "react";
import { Button, Popover, Description, Spinner } from "@heroui/react";
import { LLMConfig } from "@/app/types/chat";
import { normalizeLLMConfig } from "@/app/lib/config-utils";
import { useAppTranslation } from "@/app/i18n/hooks";

interface ConnectionTesterProps {
  config: LLMConfig;
}

/**
 * 连接测试器组件
 * 测试 LLM 配置是否正确，显示测试结果弹窗
 */
export default function ConnectionTester({ config }: ConnectionTesterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const { t } = useAppTranslation("settings");

  const handleTest = async () => {
    setIsTesting(true);
    setResult(null);
    setIsOpen(true);

    try {
      const requestConfig = normalizeLLMConfig(config);

      const response = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl: requestConfig.apiUrl,
          apiKey: requestConfig.apiKey,
          temperature: requestConfig.temperature,
          modelName: requestConfig.modelName,
          providerType: requestConfig.providerType,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          message: t("connectionTest.success", { response: data.response }),
        });
      } else {
        // 如果是 i18n key（以 models.test. 开头），则翻译；否则直接显示
        const rawError = data.error ?? "models.test.error";
        const translatedError = rawError.startsWith("models.test.")
          ? t(rawError)
          : rawError;
        setResult({
          success: false,
          message: t("connectionTest.error", { error: translatedError }),
        });
      }
    } catch (error: unknown) {
      setResult({
        success: false,
        message: t("connectionTest.error", {
          error: (error as Error).message || "network error",
        }),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setResult(null);
  };

  let popoverContent: ReactNode = null;
  if (isTesting) {
    popoverContent = (
      <div className="test-loading">
        <Spinner />
        <p>{t("connectionTest.loading")}</p>
      </div>
    );
  } else if (result) {
    const resultClassName = result.success ? "test-success" : "test-error";
    const resultIcon = result.success ? "✓" : "✗";
    popoverContent = (
      <div className={`test-result ${resultClassName}`}>
        <div className="test-icon">{resultIcon}</div>
        <p className="test-message">{result.message}</p>
      </div>
    );
  }

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <div className="w-full mt-6">
        <Button
          variant="primary"
          size="sm"
          className="mt-3 w-full"
          onPress={handleTest}
          isDisabled={isTesting}
        >
          {isTesting ? t("connectionTest.testing") : t("connectionTest.button")}
        </Button>
        <Description className="mt-3">
          {t("connectionTest.description")}
        </Description>
      </div>
      <Popover.Content className="modal-overlay-popover" placement="bottom">
        <Popover.Dialog className="modal-content test-modal">
          <Popover.Heading className="modal-title">
            {t("connectionTest.title")}
          </Popover.Heading>
          {popoverContent}
          <div className="modal-actions">
            <Button
              variant="primary"
              size="sm"
              onPress={handleClose}
              isDisabled={isTesting}
            >
              {t("connectionTest.close")}
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
