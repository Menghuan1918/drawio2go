export type SidebarTabKey = "chat" | "settings" | "version";
export type SettingsTabKey =
  | "general"
  | "drawio"
  | "models"
  | "agent"
  | "version"
  | "about";

export type SidebarNavigateDetail = {
  tab: SidebarTabKey;
  settingsTab?: SettingsTabKey;
};

export const SIDEBAR_NAVIGATE_EVENT = "sidebar-navigate";

export function dispatchSidebarNavigate(detail: SidebarNavigateDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SidebarNavigateDetail>(SIDEBAR_NAVIGATE_EVENT, { detail }),
  );
}

export function subscribeSidebarNavigate(
  callback: (detail: SidebarNavigateDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<SidebarNavigateDetail>).detail;
    if (!detail) return;
    callback(detail);
  };

  window.addEventListener(SIDEBAR_NAVIGATE_EVENT, handler);
  return () => window.removeEventListener(SIDEBAR_NAVIGATE_EVENT, handler);
}
