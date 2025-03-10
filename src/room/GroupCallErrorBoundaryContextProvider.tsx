/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  type PropsWithChildren,
  useCallback,
  useMemo,
  useRef,
} from "react";

import type { ElementCallError } from "../utils/errors.ts";
import {
  GroupCallErrorBoundaryContext,
  type GroupCallErrorBoundaryContextType,
} from "./GroupCallErrorBoundaryContext.tsx";

export const GroupCallErrorBoundaryContextProvider: FC<PropsWithChildren> = ({
  children,
}) => {
  const subscribers = useRef<Set<(error: ElementCallError) => void>>(new Set());

  // Register a component for updates
  const subscribe = useCallback(
    (cb: (error: ElementCallError) => void): (() => void) => {
      subscribers.current.add(cb);
      return (): boolean => subscribers.current.delete(cb); // Unsubscribe function
    },
    [],
  );

  // Notify all subscribers
  const notify = useCallback((error: ElementCallError) => {
    subscribers.current.forEach((callback) => callback(error));
  }, []);

  const context: GroupCallErrorBoundaryContextType = useMemo(
    () => ({
      notifyHandled: notify,
      subscribe,
    }),
    [subscribe, notify],
  );

  return (
    <GroupCallErrorBoundaryContext.Provider value={context}>
      {children}
    </GroupCallErrorBoundaryContext.Provider>
  );
};
