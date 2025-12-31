/**
 * Settings 组件模块统一导出
 */

// 子组件
export { default as SettingsNav } from "./SettingsNav";
export { default as GeneralSettingsPanel } from "./GeneralSettingsPanel";
export { default as DrawioSettingsPanel } from "./DrawioSettingsPanel";
export { default as ModelsSettingsPanel } from "./ModelsSettingsPanel";
export { default as AboutSettingsPanel } from "./AboutSettingsPanel";
export { default as ProviderEditDialog } from "./ProviderEditDialog";
export { VersionSettingsPanel } from "./VersionSettingsPanel";
export { default as ConnectionTester } from "./ConnectionTester";
export {
  default as AgentSettingsPanel,
  isSystemPromptValid,
  getSystemPromptError,
} from "./AgentSettingsPanel";

// 常量和类型
export { PROVIDER_OPTIONS, getProviderOptions } from "./constants";
export type { ProviderOption } from "./constants";
export type { SettingsTab } from "./SettingsNav";
export type { AboutSettingsPanelProps } from "./AboutSettingsPanel";
