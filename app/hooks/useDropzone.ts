"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";

function isFilesDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  try {
    return Array.from(dataTransfer.types ?? []).includes("Files");
  } catch {
    return false;
  }
}

export function useDropzone(options: {
  onFiles: (files: File[]) => void | Promise<void>;
  disabled?: boolean;
}) {
  const { onFiles, disabled = false } = options;
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragCounterRef = useRef(0);

  const resetDragState = useCallback(() => {
    dragCounterRef.current = 0;
    setIsDraggingFiles(false);
  }, []);

  useEffect(() => {
    if (disabled) return;

    const handleWindowDragOver = (event: DragEvent) => {
      if (!isFilesDrag(event.dataTransfer)) return;
      event.preventDefault();
    };

    const handleWindowDrop = (event: DragEvent) => {
      if (!isFilesDrag(event.dataTransfer)) return;
      event.preventDefault();
      resetDragState();
    };

    window.addEventListener("dragover", handleWindowDragOver, {
      passive: false,
    });
    window.addEventListener("drop", handleWindowDrop, { passive: false });
    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [disabled, resetDragState]);

  const onDragEnter = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!isFilesDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();

      if (disabled) return;

      dragCounterRef.current += 1;
      setIsDraggingFiles(true);
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!isFilesDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }

      if (disabled) return;
      setIsDraggingFiles(true);
    },
    [disabled],
  );

  const onDragLeave = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!isFilesDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();

      if (disabled) return;

      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        resetDragState();
      }
    },
    [disabled, resetDragState],
  );

  const onDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!isFilesDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();

      const files = Array.from(event.dataTransfer?.files ?? []);
      resetDragState();

      if (disabled) return;
      if (files.length === 0) return;
      const result = onFiles(files);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch(() => undefined);
      }
    },
    [disabled, onFiles, resetDragState],
  );

  const rootProps = useMemo(
    () => ({
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
    }),
    [onDragEnter, onDragLeave, onDragOver, onDrop],
  );

  return {
    isDraggingFiles,
    rootProps,
  };
}
