/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useEffect, createContext, use, type JSX } from "react";
import { type MatrixClient } from "matrix-js-sdk";

import { ErrorPage } from "./FullScreenView";
import { PosthogAnalytics } from "./analytics/PosthogAnalytics";
import { useBehavior } from "./useBehavior";
import { constant } from "./state/Behavior";
import {
  type ClientManager,
  type ClientSession,
  type ClientSessionState,
} from "./state/ClientSession";

declare global {
  interface Window {
    matrixclient: MatrixClient;
    passwordlessUser: boolean;
  }
}

// Without a provider, no one is signed in and there is no session to act on
const noClientSession: ClientSession = {
  state$: constant({ state: "signedOut" }),
};

const ClientContext = createContext<ClientSession>(noClientSession);

export const ClientContextProvider = ClientContext.Provider;

export const useClientSessionState = (): ClientSessionState =>
  useBehavior(use(ClientContext).state$);

export function useClient(): { client?: MatrixClient } {
  const state = useClientSessionState();
  return { client: state.state === "signedIn" ? state.client : undefined };
}

// Null where the session is a host's: the component, and the widget
const ClientManagerContext = createContext<ClientManager | null>(null);

export const ClientManagerProvider = ClientManagerContext.Provider;

/**
 * The manager of a session that is Element Call's own, for views that only
 * the standalone app mounts: the login and registration pages. Throws
 * elsewhere, as those views have no business being there.
 */
export function useClientManager(): ClientManager {
  const manager = use(ClientManagerContext);
  if (manager === null)
    throw new Error("This view needs a session of Element Call's own");
  return manager;
}

/**
 * The session's manager, or null where the session is a host's. For views
 * shared with the widget, which can offer to sign out only when that is ours
 * to do.
 */
export const useClientManagerIfAny = (): ClientManager | null =>
  use(ClientManagerContext);

interface Props {
  children: JSX.Element;
  /** a session from Element Call SPA, from a widget or the host (EW) */
  session: ClientSession;
}

export const ClientProvider: FC<Props> = ({ children, session }) => {
  const state = useBehavior(session.state$);

  useEffect(() => {
    if (state.state !== "signedIn") return;
    window.matrixclient = state.client;
    window.passwordlessUser = state.passwordlessUser;

    if (PosthogAnalytics.hasInstance())
      PosthogAnalytics.instance.onLoginStatusChanged();
    // Analytics follow the user's choices whoever the client belongs to
    if (PosthogAnalytics.instance.isEnabled())
      PosthogAnalytics.instance.startListeningToSettingsChanges();
  }, [state]);

  if (state.state === "error") return <ErrorPage error={state.error} />;

  return <ClientContext value={session}>{children}</ClientContext>;
};
