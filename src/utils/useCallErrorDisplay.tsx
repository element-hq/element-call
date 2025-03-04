/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContext, type ReactNode, useContext, useState } from "react";

import { type ElementCallError } from "./errors.ts";

export type ErrorAction = {
  labelKey: string;
  onClick: () => void;
};

export type ErrorState = {
  cause: ElementCallError;
  actions?: ErrorAction[]; // Optional list of actions (buttons)
};

type GlobalErrorContextType = {
  callErrorState: ErrorState | null;
  setCallErrorState: (error: ErrorState | null) => void;
  // subscribe: (callback: (isErrorActive: boolean) => void) => () => void;
};

const ErrorContext = createContext<GlobalErrorContextType | undefined>(
  undefined,
);

export const CallErrorStateProvider = ({
  children,
}: {
  children: ReactNode;
}): ReactNode => {
  const [callErrorState, setCallErrorState] = useState<ErrorState | null>(null);

  return (
    <ErrorContext.Provider value={{ callErrorState, setCallErrorState }}>
      {children}
    </ErrorContext.Provider>
  );
};

export const useCallErrorDisplay: () => GlobalErrorContextType = () => {
  const context = useContext(ErrorContext);
  if (!context)
    throw new Error(
      "useCallErrorDisplay must be used within an CallErrorStateProvider",
    );
  return context;
};
