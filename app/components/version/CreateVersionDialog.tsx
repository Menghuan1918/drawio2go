"use client";

import React from "react";
import {
  Button,
  TextField,
  Input,
  TextArea,
  Label,
  Description,
  Spinner,
  FieldError,
  RadioGroup,
  Radio,
  Select,
  ListBox,
} from "@heroui/react";
import {
  useStorageXMLVersions,
  type CreateHistoricalVersionResult,
} from "@/app/hooks/useStorageXMLVersions";
import { X, Sparkles } from "lucide-react";
import type { DrawioEditorRef } from "@/app/components/DrawioEditorNative";
import type { XMLVersion } from "@/app/lib/storage/types";
import { WIP_VERSION } from "@/app/lib/storage/constants";
import { isSubVersion } from "@/app/lib/version-utils";

type VersionType = "main" | "sub";

interface CreateVersionDialogProps {
  projectUuid: string;
  isOpen: boolean;
  onClose: () => void;
  onVersionCreated?: (result: CreateHistoricalVersionResult) => void;
  editorRef: React.RefObject<DrawioEditorRef | null>;
  parentVersion?: string;
}

/**
 * 创建版本对话框组件
 * 提供表单让用户输入版本号和描述，创建新的版本快照
 */
export function CreateVersionDialog({
  projectUuid,
  isOpen,
  onClose,
  onVersionCreated,
  editorRef,
  parentVersion,
}: CreateVersionDialogProps) {
  const [mainVersionInput, setMainVersionInput] = React.useState("");
  const [subVersionInput, setSubVersionInput] = React.useState("");
  const [versionType, setVersionType] = React.useState<VersionType>(
    parentVersion ? "sub" : "main",
  );
  const [selectedParentVersion, setSelectedParentVersion] = React.useState(
    parentVersion ?? "",
  );
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);
  const [validationError, setValidationError] = React.useState("");
  const [checkingExists, setCheckingExists] = React.useState(false);
  const [parentOptions, setParentOptions] = React.useState<XMLVersion[]>([]);
  const [isLoadingParents, setIsLoadingParents] = React.useState(false);
  const [parentOptionsError, setParentOptionsError] = React.useState<
    string | null
  >(null);
  const [exportProgress, setExportProgress] = React.useState<{
    current: number;
    total: number;
    name?: string;
  } | null>(null);
  const [successMessage, setSuccessMessage] = React.useState("");
  const closeTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const {
    createHistoricalVersion,
    getRecommendedVersion,
    validateVersion,
    isVersionExists,
    getAllXMLVersions,
  } = useStorageXMLVersions();

  const effectiveVersionNumber = React.useMemo(() => {
    if (versionType === "sub") {
      const parent = selectedParentVersion.trim();
      const suffix = subVersionInput.trim();
      if (!parent || !suffix) {
        return "";
      }
      return `${parent}.${suffix}`;
    }
    return mainVersionInput.trim();
  }, [versionType, selectedParentVersion, subVersionInput, mainVersionInput]);

  const resetVersionInputs = React.useCallback(() => {
    setMainVersionInput("");
    setSubVersionInput("");
    setSelectedParentVersion(parentVersion ?? "");
    setVersionType(parentVersion ? "sub" : "main");
  }, [parentVersion]);

  const noParentOptions =
    !parentVersion && parentOptions.length === 0 && !isLoadingParents;

  const handleVersionTypeChange = React.useCallback(
    (value: string) => {
      const next = value as VersionType;
      if (parentVersion && next === "main") {
        return;
      }
      setVersionType(next);
      setValidationError("");
      setError("");
    },
    [parentVersion],
  );

  const handleDialogClose = React.useCallback(() => {
    if (isCreating) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setSuccessMessage("");
    setExportProgress(null);
    setError("");
    setValidationError("");
    setCheckingExists(false);
    resetVersionInputs();
    onClose();
  }, [isCreating, onClose, resetVersionInputs]);

  const handleCreate = React.useCallback(async () => {
    setError("");
    setSuccessMessage("");
    setExportProgress(null);

    if (validationError) {
      return;
    }

    if (!effectiveVersionNumber) {
      setError("请输入版本号");
      return;
    }

    const validation = validateVersion(projectUuid, effectiveVersionNumber);
    if (!validation.valid) {
      setValidationError(validation.error || "版本号格式错误");
      return;
    }

    try {
      const exists = await isVersionExists(projectUuid, effectiveVersionNumber);
      if (exists) {
        setValidationError("版本号已存在");
        return;
      }
    } catch (err) {
      console.error("同步版本号唯一性校验失败:", err);
      setError("验证版本号失败,请重试");
      return;
    }

    setIsCreating(true);
    try {
      const result = await createHistoricalVersion(
        projectUuid,
        effectiveVersionNumber,
        description.trim() || undefined,
        editorRef,
        {
          onExportProgress: (progress) => {
            setExportProgress({
              current: progress.index + 1,
              total: progress.total,
              name: progress.name,
            });
          },
        },
      );

      onVersionCreated?.(result);

      const successText = result.svgAttached
        ? `版本创建成功！共 ${result.pageCount} 页，已缓存 SVG 预览。`
        : `版本创建成功！共 ${result.pageCount} 页，SVG 导出失败已自动降级。`;
      setSuccessMessage(successText);

      if (versionType === "sub") {
        setSubVersionInput("");
      } else {
        setMainVersionInput("");
      }
      setDescription("");
      setValidationError("");
      setExportProgress(null);

      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = setTimeout(() => {
        setSuccessMessage("");
        handleDialogClose();
      }, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建版本失败");
    } finally {
      setIsCreating(false);
      setExportProgress(null);
    }
  }, [
    validationError,
    effectiveVersionNumber,
    description,
    validateVersion,
    projectUuid,
    isVersionExists,
    createHistoricalVersion,
    editorRef,
    onVersionCreated,
    handleDialogClose,
    versionType,
  ]);

  const handleRecommend = React.useCallback(async () => {
    try {
      if (versionType === "sub") {
        const parent = selectedParentVersion?.trim();
        if (!parent) {
          setError("请选择父版本后再获取推荐子版本");
          return;
        }
        const recommended = await getRecommendedVersion(projectUuid, parent);
        const prefix = `${parent}.`;
        const suffix = recommended.startsWith(prefix)
          ? recommended.slice(prefix.length)
          : "";
        setSubVersionInput(suffix);
      } else {
        const recommended = await getRecommendedVersion(projectUuid);
        setMainVersionInput(recommended);
      }
      setError("");
    } catch (err) {
      console.error("获取推荐版本号失败:", err);
      setError("获取推荐版本号失败");
    }
  }, [versionType, selectedParentVersion, projectUuid, getRecommendedVersion]);

  React.useEffect(() => {
    if (isOpen && projectUuid) {
      setSuccessMessage("");
      setExportProgress(null);
    }
  }, [isOpen, projectUuid]);

  React.useEffect(() => {
    if (!isOpen || !projectUuid) {
      return;
    }

    const shouldPrefillMain =
      versionType === "main" && !mainVersionInput.trim();
    const shouldPrefillSub =
      versionType === "sub" &&
      !subVersionInput.trim() &&
      !!selectedParentVersion;

    if (!shouldPrefillMain && !shouldPrefillSub) {
      return;
    }

    let isMounted = true;
    getRecommendedVersion(
      projectUuid,
      versionType === "sub" ? selectedParentVersion : undefined,
    )
      .then((recommended) => {
        if (!isMounted) return;
        if (versionType === "sub") {
          const prefix = `${selectedParentVersion}.`;
          const suffix = recommended.startsWith(prefix)
            ? recommended.slice(prefix.length)
            : "";
          setSubVersionInput(suffix);
        } else {
          setMainVersionInput(recommended);
        }
      })
      .catch((err) => {
        console.error("获取推荐版本号失败:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [
    isOpen,
    projectUuid,
    versionType,
    selectedParentVersion,
    subVersionInput,
    mainVersionInput,
    getRecommendedVersion,
  ]);

  React.useEffect(() => {
    if (versionType === "sub") {
      if (!selectedParentVersion) {
        setValidationError("请选择父版本");
        setCheckingExists(false);
        return;
      }

      const suffix = subVersionInput.trim();
      if (!suffix) {
        setValidationError("请输入子版本号");
        setCheckingExists(false);
        return;
      }

      if (!/^\d+$/.test(suffix)) {
        setValidationError("子版本号必须为纯数字");
        setCheckingExists(false);
        return;
      }
    }

    if (!effectiveVersionNumber) {
      setValidationError("");
      setCheckingExists(false);
      return;
    }

    const validation = validateVersion(projectUuid, effectiveVersionNumber);
    if (!validation.valid) {
      setValidationError(validation.error || "版本号格式错误");
      setCheckingExists(false);
      return;
    }

    const currentVersion = effectiveVersionNumber;
    const timer = setTimeout(async () => {
      setCheckingExists(true);
      try {
        const exists = await isVersionExists(projectUuid, currentVersion);
        if (currentVersion === effectiveVersionNumber) {
          if (exists) {
            setValidationError("版本号已存在");
          } else {
            setValidationError("");
          }
        }
      } catch (err) {
        console.error("版本号唯一性检查失败:", err);
      } finally {
        setCheckingExists(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [
    effectiveVersionNumber,
    versionType,
    selectedParentVersion,
    subVersionInput,
    projectUuid,
    validateVersion,
    isVersionExists,
  ]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        !isCreating &&
        effectiveVersionNumber &&
        !validationError &&
        !checkingExists
      ) {
        e.preventDefault();
        handleCreate();
      } else if (e.key === "Escape" && !isCreating) {
        e.preventDefault();
        handleDialogClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    isCreating,
    effectiveVersionNumber,
    validationError,
    checkingExists,
    handleCreate,
    handleDialogClose,
  ]);

  React.useEffect(() => {
    if (!isOpen) {
      setError("");
      setValidationError("");
      setSuccessMessage("");
      setExportProgress(null);
      setDescription("");
      setCheckingExists(false);
      resetVersionInputs();
    }
  }, [isOpen, resetVersionInputs]);

  React.useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (parentVersion) {
      setVersionType("sub");
      setSelectedParentVersion(parentVersion);
    }
  }, [parentVersion]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (versionType !== "sub") return;
    if (selectedParentVersion) return;

    if (parentOptions.length > 0) {
      setSelectedParentVersion(parentOptions[0].semantic_version);
    }
  }, [isOpen, versionType, parentOptions, selectedParentVersion]);

  React.useEffect(() => {
    if (!isOpen || !projectUuid) {
      return;
    }

    let isMounted = true;
    setIsLoadingParents(true);
    setParentOptionsError(null);

    getAllXMLVersions(projectUuid)
      .then((versions) => {
        if (!isMounted) return;
        const filtered = versions.filter(
          (version) =>
            version.semantic_version !== WIP_VERSION &&
            !isSubVersion(version.semantic_version),
        );
        setParentOptions(filtered);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("加载主版本列表失败:", err);
        setParentOptions([]);
        setParentOptionsError("无法加载主版本列表，请稍后重试");
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingParents(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, projectUuid, getAllXMLVersions]);

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={handleDialogClose}>
      <div className="dialog-container" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3 className="text-lg font-semibold">创建新版本</h3>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label="关闭创建版本对话框"
            onPress={handleDialogClose}
            isDisabled={isCreating}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="dialog-content">
          <RadioGroup
            className="w-full"
            value={versionType}
            orientation="horizontal"
            onChange={handleVersionTypeChange}
            isDisabled={isCreating}
          >
            <Label>版本类型</Label>
            <Description className="mt-2">
              选择要创建的版本类型，子版本会继承父版本号
            </Description>
            <Radio value="main" isDisabled={!!parentVersion}>
              <Radio.Content>
                <Label>主版本</Label>
                <Description className="text-xs text-default-500">
                  标准 x.y.z 格式（如 1.2.0）
                </Description>
              </Radio.Content>
            </Radio>
            <Radio value="sub">
              <Radio.Content>
                <Label>子版本</Label>
                <Description className="text-xs text-default-500">
                  为主版本追加 .h（如 1.2.0.1）
                </Description>
              </Radio.Content>
            </Radio>
          </RadioGroup>

          {versionType === "sub" && (
            <Select
              className="w-full mt-4"
              value={selectedParentVersion || null}
              onChange={(value) => {
                if (typeof value === "string") {
                  setSelectedParentVersion(value);
                }
              }}
              isDisabled={isCreating || !!parentVersion}
            >
              <Label>父版本 *</Label>
              <Select.Trigger className="mt-2 flex w-full items-center justify-between rounded-md border border-default-200 bg-content1 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                <Select.Value className="text-sm leading-6 text-foreground" />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Content className="rounded-2xl border border-default-200 bg-content1 p-2 shadow-2xl">
                <ListBox className="flex flex-col gap-1">
                  {parentOptions.map((version) => (
                    <ListBox.Item
                      key={version.id}
                      id={version.semantic_version}
                      textValue={`v${version.semantic_version} - ${
                        version.description?.trim() || "暂无描述"
                      }`}
                      className="select-item flex items-center justify-between rounded-xl px-3 py-2 text-sm text-foreground hover:bg-primary-50"
                    >
                      <span className="font-medium text-foreground">
                        v{version.semantic_version} -{" "}
                        {version.description?.trim()
                          ? version.description
                          : "暂无描述"}
                      </span>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Content>
              {parentOptionsError ? (
                <FieldError className="mt-2">{parentOptionsError}</FieldError>
              ) : isLoadingParents ? (
                <Description className="mt-2 flex items-center gap-2 text-default-500">
                  <Spinner size="sm" />
                  正在加载可用主版本...
                </Description>
              ) : noParentOptions ? (
                <FieldError className="mt-2">
                  暂无可用主版本，请先创建一个主版本后再添加子版本
                </FieldError>
              ) : (
                <Description className="mt-2 text-default-500">
                  {parentVersion
                    ? `父版本已锁定为 v${parentVersion}`
                    : "仅显示三段式主版本（排除 WIP 与子版本）"}
                </Description>
              )}
            </Select>
          )}

          <TextField
            className="w-full mt-4"
            isRequired
            isInvalid={!!validationError}
          >
            <Label>{versionType === "sub" ? "子版本号 *" : "版本号 *"}</Label>
            <div
              className={`mt-2 flex gap-2 ${versionType === "sub" ? "items-center" : ""}`}
            >
              {versionType === "sub" ? (
                <>
                  <span className="min-w-[120px] rounded-md border border-dashed border-default-200 bg-default-100 px-3 py-2 text-sm text-default-600">
                    {selectedParentVersion
                      ? `${selectedParentVersion}.`
                      : "未选择父版本"}
                  </span>
                  <Input
                    value={subVersionInput}
                    onChange={(e) =>
                      setSubVersionInput(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="1"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="flex-1"
                    disabled={isCreating || !selectedParentVersion}
                  />
                </>
              ) : (
                <Input
                  value={mainVersionInput}
                  onChange={(e) => setMainVersionInput(e.target.value)}
                  placeholder="1.0.0"
                  className="flex-1"
                  disabled={isCreating}
                />
              )}
              <Button
                size="sm"
                variant="secondary"
                onPress={handleRecommend}
                isDisabled={
                  isCreating ||
                  (versionType === "sub" && !selectedParentVersion)
                }
              >
                <Sparkles className="w-3.5 h-3.5" />
                智能推荐
              </Button>
            </div>
            {checkingExists ? (
              <Description className="mt-2 flex items-center gap-2 text-blue-600">
                <Spinner size="sm" />
                正在检查版本号...
              </Description>
            ) : validationError ? (
              <FieldError className="mt-2">{validationError}</FieldError>
            ) : effectiveVersionNumber ? (
              <Description className="mt-2 text-green-600">
                ✓ 版本号 {effectiveVersionNumber} 可用
              </Description>
            ) : versionType === "sub" ? (
              <Description className="mt-2">
                请输入子版本号（纯数字），最终版本将保存为
                {selectedParentVersion
                  ? ` ${selectedParentVersion}.子版本号`
                  : " 父版本.子版本号"}
              </Description>
            ) : (
              <Description className="mt-2">
                格式：x.y.z（如 1.0.0），或升级后生成 x.y.z.h 子版本
              </Description>
            )}
          </TextField>

          <TextField className="w-full mt-4">
            <Label>版本描述（可选）</Label>
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述这个版本的主要变更..."
              rows={4}
              className="mt-2"
              disabled={isCreating}
            />
            <Description className="mt-2">
              简要说明这个版本的更改内容
            </Description>
          </TextField>

          {error && (
            <div className="error-message mt-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {successMessage && !isCreating && (
            <div className="success-message mt-4 text-sm text-green-600">
              {successMessage}
            </div>
          )}

          {isCreating && (
            <div className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {exportProgress?.total ? (
                <span>
                  正在导出第 {exportProgress.current}/{exportProgress.total} 页
                  {exportProgress.name ? `（${exportProgress.name}）` : ""}...
                </span>
              ) : (
                <span>正在导出 SVG 并保存版本，请稍候...</span>
              )}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <Button
            variant="secondary"
            onPress={handleDialogClose}
            isDisabled={isCreating}
          >
            取消
          </Button>
          <Button
            variant="primary"
            onPress={handleCreate}
            isDisabled={
              !effectiveVersionNumber ||
              isCreating ||
              !!validationError ||
              checkingExists
            }
          >
            {isCreating ? (
              <>
                <Spinner size="sm" />
                <span className="ml-2">创建中...</span>
              </>
            ) : (
              "创建版本"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
