export type DebouncedFunction<Args extends unknown[]> = ((
  ...args: Args
) => void) & {
  flush: () => void;
  cancel: () => void;
};

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait = 300,
): DebouncedFunction<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Args | null = null;

  const debounced = (...args: Args) => {
    lastArgs = args;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) {
        fn(...lastArgs);
      }
    }, wait);
  };

  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = null;
    }
  };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  return debounced as DebouncedFunction<Args>;
}

/**
 * 为异步存储任务提供统一的加载/错误处理包装器
 */
export async function runStorageTask<T>(
  task: () => Promise<T>,
  options?: {
    setLoading?: (value: boolean) => void;
    setError?: (error: Error | null) => void;
  },
): Promise<T> {
  const { setLoading, setError } = options ?? {};
  setLoading?.(true);
  setError?.(null);

  try {
    return await task();
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    setError?.(error);
    throw error;
  } finally {
    setLoading?.(false);
  }
}

/**
 * 为 Promise 添加超时保护
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    }),
  ]);
}

export function generateProjectUUID(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `project-${crypto.randomUUID()}`;
  }

  const random = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now();
  return `project-${timestamp}-${random}`;
}

/**
 * 通用 UUID 生成器
 * - 默认前缀为 "id"
 * - 优先使用 crypto.randomUUID，回退到时间戳 + 随机字符串
 */
export function generateUUID(prefix: string = "id"): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  const random = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now();
  return `${prefix}-${timestamp}-${random}`;
}
