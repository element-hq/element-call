/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  useEffect,
  useState,
  createContext,
  use,
  useMemo,
  type JSX,
} from "react";
import { logger } from "matrix-js-sdk/lib/logger";
import { type ISyncStateData, type SyncState } from "matrix-js-sdk/lib/sync";
import { ClientEvent, type MatrixClient } from "matrix-js-sdk";

import { ErrorPage } from "./FullScreenView";
import { useLeaveToHome } from "./LeaveToHomeContext";
import {
  PosthogAnalytics,
  RegistrationType,
} from "./analytics/PosthogAnalytics";
import { useBehavior } from "./useBehavior";
import { constant } from "./state/Behavior";
import {
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

export const useClientSession = (): ClientSession => use(ClientContext);

export const useClientSessionState = (): ClientSessionState =>
  useBehavior(useClientSession().state$);

export function useClient(): { client?: MatrixClient } {
  const state = useClientSessionState();
  return { client: state.state === "signedIn" ? state.client : undefined };
}

// Plain representation of the `ClientContext` as a helper for old components that expected an object with multiple fields.
export function useClientLegacy(): {
  client?: MatrixClient;
  passwordlessUser: boolean;
  loading: boolean;
  authenticated: boolean;
  logout?: () => void;
  error?: Error;
} {
  const state = useClientSessionState();
  const logout = useLogout();
  const client = state.state === "signedIn" ? state.client : undefined;

  return {
    client,
    passwordlessUser: state.state === "signedIn" && state.passwordlessUser,
    loading: state.state === "loading",
    authenticated: client !== undefined,
    logout,
    error: state.state === "error" ? state.error : undefined,
  };
}

/**
 * Ends the session, where it is ours to end, and leaves for home.
 */
function useLogout(): (() => void) | undefined {
  const { logout } = useClientSession();
  const leaveToHome = useLeaveToHome();
  return useMemo(() => {
    if (logout === undefined) return undefined;
    return (): void => {
      logout()
        .then(() => {
          leaveToHome?.();
          PosthogAnalytics.instance.logout();
          PosthogAnalytics.instance.setRegistrationType(RegistrationType.Guest);
        })
        .catch((e) => logger.error("Failed to log out", e));
    };
  }, [logout, leaveToHome]);
}

/**
 * Whether the signed-in client is supposed to be connected but is not.
 */
export function useClientDisconnected(): boolean {
  const state = useClientSessionState();
  const client = state.state === "signedIn" ? state.client : undefined;
  // Tagged with the client it describes, so that a swapped client does not
  // inherit the old one's verdict before its first sync
  const [disconnected, setDisconnected] = useState<
    [MatrixClient, boolean] | null
  >(null);

  useEffect(() => {
    if (client === undefined) return;
    const onSync = (
      syncState: SyncState,
      _old: SyncState | null,
      data?: ISyncStateData,
    ): void => setDisconnected([client, clientIsDisconnected(syncState, data)]);
    client.on(ClientEvent.Sync, onSync);
    return (): void => {
      client.removeListener(ClientEvent.Sync, onSync);
    };
  }, [client]);

  return disconnected !== null && disconnected[0] === client && disconnected[1];
}

interface Props {
  children: JSX.Element;
  /**
   * Where the client comes from: a session of Element Call's own, or one a
   * host has supplied.
   */
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

const clientIsDisconnected = (
  syncState: SyncState,
  syncData?: ISyncStateData,
): boolean =>
  syncState === "ERROR" && syncData?.error?.name === "ConnectionError";
