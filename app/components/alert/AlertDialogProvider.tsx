"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import GlobalAlertDialog from "./GlobalAlertDialog";
import type {
  AlertDialogContextValue,
  AlertDialogPayload,
  AlertDialogState,
} from "@/app/types/alert-dialog";

type AlertDialogInternalState = AlertDialogState & { isProcessing: boolean };

type AlertDialogAction =
  | { type: "OPEN"; payload: AlertDialogPayload }
  | { type: "CLOSE" }
  | { type: "START_PROCESSING" }
  | { type: "STOP_PROCESSING" };

const initialState: AlertDialogInternalState = {
  isOpen: false,
  status: "warning",
  title: "",
  description: "",
  actionLabel: undefined,
  cancelLabel: undefined,
  onAction: undefined,
  onCancel: undefined,
  isDismissable: false,
  isProcessing: false,
};

const AlertDialogContext = createContext<AlertDialogContextValue | null>(null);
const AlertDialogInternalContext = createContext<{
  state: AlertDialogInternalState;
  dispatch: Dispatch<AlertDialogAction>;
} | null>(null);

const alertDialogReducer = (
  state: AlertDialogInternalState,
  action: AlertDialogAction,
): AlertDialogInternalState => {
  switch (action.type) {
    case "OPEN":
      return {
        ...initialState,
        ...action.payload,
        isOpen: true,
        isProcessing: false,
      };
    case "CLOSE":
      return { ...initialState };
    case "START_PROCESSING":
      return { ...state, isProcessing: true };
    case "STOP_PROCESSING":
      return { ...state, isProcessing: false };
    default:
      return state;
  }
};

export function AlertDialogProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(alertDialogReducer, initialState);

  const open = useCallback((payload: AlertDialogPayload) => {
    dispatch({ type: "OPEN", payload });
  }, []);

  const close = useCallback(() => {
    dispatch({ type: "CLOSE" });
  }, []);

  const contextValue = useMemo<AlertDialogContextValue>(
    () => ({ open, close }),
    [open, close],
  );

  const internalValue = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return (
    <AlertDialogContext.Provider value={contextValue}>
      <AlertDialogInternalContext.Provider value={internalValue}>
        {children}
        <GlobalAlertDialog />
      </AlertDialogInternalContext.Provider>
    </AlertDialogContext.Provider>
  );
}

export const useAlertDialog = (): AlertDialogContextValue => {
  const context = useContext(AlertDialogContext);
  if (!context) {
    throw new Error("useAlertDialog must be used within AlertDialogProvider");
  }
  return context;
};

export const useAlertDialogInternal = () => {
  const context = useContext(AlertDialogInternalContext);
  if (!context) {
    throw new Error(
      "useAlertDialogInternal must be used within AlertDialogProvider",
    );
  }
  return context;
};
