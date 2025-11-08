"use client";

import { useState } from "react";
import { Button, Popover, Description, Spinner } from "@heroui/react";
import { LLMConfig } from "@/app/types/chat";
import { normalizeLLMConfig } from "@/app/lib/config-utils";

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
          message: `测试成功！模型响应：${data.response}`,
        });
      } else {
        setResult({
          success: false,
          message: `测试失败：${data.error}`,
        });
      }
    } catch (error: unknown) {
      setResult({
        success: false,
        message: `测试失败：${(error as Error).message || "网络错误"}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setResult(null);
  };

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <div className="w-full mt-6">
        <Button
          variant="primary"
          size="sm"
          className="button-primary mt-3 w-full"
          onPress={handleTest}
          isDisabled={isTesting}
        >
          {isTesting ? "测试中..." : "测试连接"}
        </Button>
        <Description className="mt-3">
          测试当前配置是否正确，发送一个简单的测试请求
        </Description>
      </div>
      <Popover.Content className="modal-overlay-popover" placement="bottom">
        <Popover.Dialog className="modal-content test-modal">
          <Popover.Heading className="modal-title">测试结果</Popover.Heading>
          {isTesting ? (
            <div className="test-loading">
              <Spinner />
              <p>正在测试连接...</p>
            </div>
          ) : result ? (
            <div
              className={`test-result ${
                result.success ? "test-success" : "test-error"
              }`}
            >
              <div className="test-icon">{result.success ? "✓" : "✗"}</div>
              <p className="test-message">{result.message}</p>
            </div>
          ) : null}
          <div className="modal-actions">
            <Button
              variant="primary"
              size="sm"
              className="sidebar-button button-primary"
              onPress={handleClose}
              isDisabled={isTesting}
            >
              关闭
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
