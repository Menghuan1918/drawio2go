/**
 * 文件操作相关的工具函数
 */

interface FileDialogOptions {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties?: string[];
}

/**
 * 使用 Electron 文件保存对话框
 */
export const showSaveDialog = async (
  options: FileDialogOptions,
): Promise<string | null> => {
  if (window.electron?.showSaveDialog) {
    try {
      return await window.electron.showSaveDialog(options);
    } catch (error) {
      console.error("保存对话框失败:", error);
      return null;
    }
  }
  return null;
};

/**
 * 使用 Electron 文件打开对话框
 */
export const showOpenDialog = async (
  options: FileDialogOptions,
): Promise<string[] | null> => {
  if (window.electron?.showOpenDialog) {
    try {
      return await window.electron.showOpenDialog(options);
    } catch (error) {
      console.error("打开对话框失败:", error);
      return null;
    }
  }
  return null;
};

/**
 * 使用 Electron 写入文件
 */
export const writeFile = async (
  filePath: string,
  content: string,
): Promise<boolean> => {
  if (window.electron?.writeFile) {
    try {
      await window.electron.writeFile(filePath, content);
      return true;
    } catch (error) {
      console.error("写入文件失败:", error);
      return false;
    }
  }
  return false;
};

/**
 * 使用 Electron 读取文件
 */
export const readFile = async (filePath: string): Promise<string | null> => {
  if (window.electron?.readFile) {
    try {
      return await window.electron.readFile(filePath);
    } catch (error) {
      console.error("读取文件失败:", error);
      return null;
    }
  }
  return null;
};

/**
 * 浏览器环境下载文件
 */
export const downloadFile = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * 浏览器环境文件选择
 */
export const selectFile = (accept: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const text = await file.text();
          resolve(text);
        } catch (error) {
          console.error("读取文件失败:", error);
          resolve(null);
        }
      } else {
        resolve(null);
      }
    };
    input.click();
  });
};
