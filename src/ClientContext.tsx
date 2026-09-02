/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  useCallback,
  useEffect,
  useState,
  createContext,
  use,
  useRef,
  useMemo,
  type JSX,
} from "react";
import { useNavigate } from "react-router-dom";
import { logger } from "matrix-js-sdk/lib/logger";
import { type ISyncStateData, type SyncState } from "matrix-js-sdk/lib/sync";
import { ClientEvent, type MatrixClient } from "matrix-js-sdk";

import { ErrorPage } from "./FullScreenView";
import { widget } from "./widget";
import { useHostBridge } from "./HostBridge";
import {
  PosthogAnalytics,
  RegistrationType,
} from "./analytics/PosthogAnalytics";
import { useEventTarget } from "./useEvents";
import { OpenElsewhereError } from "./RichError";

declare global {
  interface Window {
    matrixclient: MatrixClient;
    passwordlessUser: boolean;
  }
}

export type ClientState = ValidClientState | ErrorState;

export type ValidClientState = {
  state: "valid";
  authenticated?: AuthenticatedClient;
  // 'Disconnected' rather than 'connected' because it tracks specifically
  // whether the client is supposed to be connected but is not
  disconnected: boolean;
  supportedFeatures: {
    reactions: boolean;
  };
  setClient: (client: MatrixClient, session: Session) => void;
};

export type AuthenticatedClient = {
  client: MatrixClient;
  isPasswordlessUser: boolean;
  changePassword: (password: string) => Promise<void>;
  logout: () => void;
};

export type ErrorState = {
  state: "error";
  error: Error;
};

const ClientContext = createContext<ClientState | undefined>(undefined);

export const ClientContextProvider = ClientContext.Provider;

export const useClientState = (): ClientState | undefined => use(ClientContext);

export function useClient(): {
  client?: MatrixClient;
  setClient?: (client: MatrixClient, session: Session) => void;
} {
  let client;
  let setClient;

  const clientState = useClientState();
  if (clientState?.state === "valid") {
    client = clientState.authenticated?.client;
    setClient = clientState.setClient;
  }

  return { client, setClient };
}

// Plain representation of the `ClientContext` as a helper for old components that expected an object with multiple fields.
export function useClientLegacy(): {
  client?: MatrixClient;
  setClient?: (client: MatrixClient, session: Session) => void;
  passwordlessUser: boolean;
  loading: boolean;
  authenticated: boolean;
  logout?: () => void;
  error?: Error;
} {
  const clientState = useClientState();

  let client;
  let setClient;
  let passwordlessUser = false;
  let loading = true;
  let error;
  let authenticated = false;
  let logout;

  if (clientState?.state === "valid") {
    client = clientState.authenticated?.client;
    setClient = clientState.setClient;
    passwordlessUser = clientState.authenticated?.isPasswordlessUser ?? false;
    loading = false;
    authenticated = client !== undefined;
    logout = clientState.authenticated?.logout;
  } else if (clientState?.state === "error") {
    error = clientState.error;
    loading = false;
  }

  return {
    client,
    setClient,
    passwordlessUser,
    loading,
    authenticated,
    logout,
    error,
  };
}

const loadChannel =
  "BroadcastChannel" in window ? new BroadcastChannel("load") : null;

interface Props {
  children: JSX.Element;
  /**
   * The client Element Call should use.
   *
   * When a host embeds Element Call it already has a client, and owns the
   * user's session; supplying it here means Element Call neither authenticates
   * anyone nor manages their session. Left out, Element Call finds a client
   * itself — from the widget API, or by restoring or creating a session of its
   * own.
   */
  client?: MatrixClient;
}

export const ClientProvider: FC<Props> = ({ children, client }) => {
  const navigate = useNavigate();
  const hostBridge = useHostBridge();

  // null = signed out, undefined = loading
  const [initClientState, setInitClientState] = useState<
    InitResult | null | undefined
  >(
    client === undefined
      ? undefined
      : // A supplied client belongs to the host, so there is no session of ours
        // to restore and nothing to wait for.
        { client, passwordlessUser: false },
  );

  const initializing = useRef(false);
  useEffect(() => {
    if (client !== undefined) return;
    // In case the component is mounted, unmounted, and remounted quickly (as
    // React does in strict mode), we need to make sure not to doubly initialize
    // the client.
    if (initializing.current) return;
    initializing.current = true;

    loadClient()
      .then((initResult) => {
        setInitClientState(initResult);
        if (PosthogAnalytics.instance.isEnabled())
          PosthogAnalytics.instance.startListeningToSettingsChanges();
      })
      .catch((err) => logger.error(err))
      .finally(() => (initializing.current = false));
  }, [client]);

  const changePassword = useCallback(
    async (password: string) => {
      const session = loadSession();
      if (!initClientState?.client || !session) {
        return;
      }

      await initClientState.client.setPassword(
        {
          type: "m.login.password",
          identifier: {
            type: "m.id.user",
            user: session.user_id,
          },
          user: session.user_id,
          password: session.tempPassword,
        },
        password,
      );

      saveSession({ ...session, passwordlessUser: false });

      setInitClientState({
        ...initClientState,
        passwordlessUser: false,
      });
    },
    [initClientState],
  );

  const setClient = useCallback(
    (client: MatrixClient, session: Session) => {
      const oldClient = initClientState?.client;
      if (oldClient && oldClient !== client) {
        oldClient.stopClient();
      }

      saveSession(session);
      setInitClientState({
        client,
        passwordlessUser: session.passwordlessUser,
      });
      if (PosthogAnalytics.instance.isEnabled())
        PosthogAnalytics.instance.startListeningToSettingsChanges();
    },
    [initClientState?.client],
  );

  const logout = useCallback(async () => {
    const client = initClientState?.client;
    if (!client) {
      return;
    }

    await client.logout(true);
    await client.clearStores();
    clearSession();
    setInitClientState(null);
    await navigate("/");
    PosthogAnalytics.instance.logout();
    PosthogAnalytics.instance.setRegistrationType(RegistrationType.Guest);
  }, [navigate, initClientState?.client]);

  // To protect against multiple sessions writing to the same storage
  // simultaneously, we send a broadcast message that shuts down all other
  // running instances of the app. Element Call only has storage of its own to
  // protect when it created the session itself; given a client, or running as a
  // widget, it is mostly stateless.
  const ownsSession = client === undefined && widget === null;
  useEffect(() => {
    if (ownsSession) loadChannel?.postMessage({});
  }, [ownsSession]);

  const [alreadyOpenedErr, setAlreadyOpenedErr] = useState<Error | undefined>(
    undefined,
  );
  useEventTarget(
    loadChannel,
    "message",
    useCallback(() => {
      initClientState?.client.stopClient();
      setAlreadyOpenedErr(new OpenElsewhereError());
    }, [initClientState?.client, setAlreadyOpenedErr]),
  );

  const [isDisconnected, setIsDisconnected] = useState(false);
  const [supportsReactions, setSupportsReactions] = useState(false);

  const state: ClientState | undefined = useMemo(() => {
    if (alreadyOpenedErr) {
      return { state: "error", error: alreadyOpenedErr };
    }

    if (initClientState === undefined) return undefined;

    const authenticated =
      initClientState === null
        ? undefined
        : {
            client: initClientState.client,
            isPasswordlessUser: initClientState.passwordlessUser,
            changePassword,
            logout,
          };

    return {
      state: "valid",
      authenticated,
      setClient,
      disconnected: isDisconnected,
      supportedFeatures: {
        reactions: supportsReactions,
      },
    };
  }, [
    alreadyOpenedErr,
    changePassword,
    initClientState,
    logout,
    setClient,
    isDisconnected,
    supportsReactions,
  ]);

  const onSync = useCallback(
    (state: SyncState, _old: SyncState | null, data?: ISyncStateData) => {
      setIsDisconnected(clientIsDisconnected(state, data));
    },
    [],
  );

  useEffect(() => {
    if (!initClientState) {
      return;
    }

    window.matrixclient = initClientState.client;
    window.passwordlessUser = initClientState.passwordlessUser;

    if (PosthogAnalytics.hasInstance())
      PosthogAnalytics.instance.onLoginStatusChanged();

    if (initClientState.client) {
      initClientState.client.on(ClientEvent.Sync, onSync);
    }

    if (!hostBridge.supportsReactions)
      logger.warn("The host does not permit reactions");
    setSupportsReactions(hostBridge.supportsReactions);

    return (): void => {
      if (initClientState.client) {
        initClientState.client.removeListener(ClientEvent.Sync, onSync);
      }
    };
  }, [initClientState, onSync, hostBridge]);

  if (alreadyOpenedErr) {
    return <ErrorPage error={alreadyOpenedErr} />;
  }

  return <ClientContext value={state}>{children}</ClientContext>;
};

export type InitResult = {
  client: MatrixClient;
  passwordlessUser: boolean;
};

async function loadClient(): Promise<InitResult | null> {
  if (widget) {
    // We're inside a widget, so let's engage *matryoshka mode*
    logger.log("Using a matryoshka client");
    const client = await widget.client;
    return {
      client,
      passwordlessUser: false,
    };
  } else {
    const { initSPA } = await import("./utils/spa");
    return initSPA(loadSession, clearSession);
  }
}

export interface Session {
  user_id: string;
  device_id: string;
  access_token: string;
  passwordlessUser: boolean;
  tempPassword?: string;
}

const clearSession = (): void => localStorage.removeItem("matrix-auth-store");
const saveSession = (s: Session): void =>
  localStorage.setItem("matrix-auth-store", JSON.stringify(s));
const loadSession = (): Session | undefined => {
  const data = localStorage.getItem("matrix-auth-store");
  if (!data) {
    return undefined;
  }

  return JSON.parse(data);
};

const clientIsDisconnected = (
  syncState: SyncState,
  syncData?: ISyncStateData,
): boolean =>
  syncState === "ERROR" && syncData?.error?.name === "ConnectionError";
