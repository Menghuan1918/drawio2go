"use client";

import i18next, { type BackendModule } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import { defaultLocale, locales, namespaces } from "./config";

// 语言偏好缓存键（需兼容 Electron，所有 localStorage 访问均包裹 try/catch）
export const LANGUAGE_STORAGE_KEY = "drawio2go-language";

const isBrowser = typeof window !== "undefined";
type ElectronBridge = { electron?: unknown };

const isElectron =
  isBrowser && Boolean((window as unknown as ElectronBridge).electron);
const isFileProtocol = isBrowser && window.location?.protocol === "file:";
const loadPathPrefix = isElectron || isFileProtocol ? "." : "";
const loadPath = `${loadPathPrefix}/locales/{{lng}}/{{ns}}.json`;

// 定制安全的 localStorage 探测器，避免 SSR 与 Electron 环境报错
const safeLocalStorageDetector = {
  name: "safeLocalStorage",
  lookup: () => {
    if (!isBrowser) return undefined;
    try {
      return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  },
  cacheUserLanguage: (lng: string) => {
    if (!isBrowser) return;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
    } catch {
      // 忽略写入失败（无痕模式 / Electron file://）
    }
  },
};

// 轻量自定义 Backend：支持 file:// 协议与动态按需加载 JSON 资源
let backendOptions: { loadPath?: string } = {};

const fetchBackend: BackendModule = {
  type: "backend",
  init(_services, options) {
    backendOptions = options || {};
  },
  read(language, namespace, callback) {
    const pathTemplate = backendOptions.loadPath ?? loadPath;
    const url = pathTemplate
      .replace("{{lng}}", language)
      .replace("{{ns}}", namespace);

    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed loading ${url} (${response.status})`);
        }
        return response.json();
      })
      .then((data) => callback(null, data))
      .catch((error) => callback(error as Error, false));
  },
};

const languageDetector = new LanguageDetector();
languageDetector.addDetector(safeLocalStorageDetector);

const i18n = i18next.createInstance();

i18n
  // 插件顺序：语言检测 → 资源加载 → React 绑定
  .use(languageDetector)
  .use(fetchBackend)
  .use(initReactI18next)
  .init({
    debug: false,
    fallbackLng: defaultLocale,
    supportedLngs: locales as unknown as string[],
    ns: namespaces as unknown as string[],
    defaultNS: namespaces[0],
    load: "currentOnly",
    detection: {
      order: ["safeLocalStorage", "navigator", "htmlTag"],
      caches: ["safeLocalStorage"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      htmlTag: isBrowser ? document.documentElement : undefined,
    },
    backend: {
      loadPath,
    },
    react: {
      useSuspense: false,
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
