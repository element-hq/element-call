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
