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

import type { WidgetApi } from "matrix-widget-api";
import { ErrorPage } from "./FullScreenView";
import { widget } from "./widget";
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
    thumbnails: boolean;
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
}

export const ClientProvider: FC<Props> = ({ children }) => {
  const navigate = useNavigate();

  // null = signed out, undefined = loading
  const [initClientState, setInitClientState] = useState<
    InitResult | null | undefined
  >(undefined);

  const initializing = useRef(false);
  useEffect(() => {
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
  }, []);

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
        widgetApi: null,
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
  // running instances of the app. This isn't necessary if the app is running in
  // a widget though, since then it'll be mostly stateless.
  useEffect(() => {
    if (!widget) loadChannel?.postMessage({});
  }, []);

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
  const [supportsThumbnails, setSupportsThumbnails] = useState(false);

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
        thumbnails: supportsThumbnails,
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
    supportsThumbnails,
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

    if (initClientState.widgetApi) {
      // There is currently no widget API for authenticated media thumbnails.
      setSupportsThumbnails(false);
      const reactSend = initClientState.widgetApi.hasCapability(
        "org.matrix.msc2762.send.event:m.reaction",
      );
      const redactSend = initClientState.widgetApi.hasCapability(
        "org.matrix.msc2762.send.event:m.room.redaction",
      );
      const reactRcv = initClientState.widgetApi.hasCapability(
        "org.matrix.msc2762.receive.event:m.reaction",
      );
      const redactRcv = initClientState.widgetApi.hasCapability(
        "org.matrix.msc2762.receive.event:m.room.redaction",
      );

      if (!reactSend || !reactRcv || !redactSend || !redactRcv) {
        logger.warn("Widget does not support reactions");
        setSupportsReactions(false);
      } else {
        setSupportsReactions(true);
      }
    } else {
      setSupportsReactions(true);
      setSupportsThumbnails(true);
    }

    return (): void => {
      if (initClientState.client) {
        initClientState.client.removeListener(ClientEvent.Sync, onSync);
      }
    };
  }, [initClientState, onSync]);

  if (alreadyOpenedErr) {
    return <ErrorPage widget={widget} error={alreadyOpenedErr} />;
  }

  return <ClientContext value={state}>{children}</ClientContext>;
};

export type InitResult = {
  widgetApi: WidgetApi | null;
  client: MatrixClient;
  passwordlessUser: boolean;
};

async function loadClient(): Promise<InitResult | null> {
  if (widget) {
    // We're inside a widget, so let's engage *matryoshka mode*
    logger.log("Using a matryoshka client");
    const client = await widget.client;
    return {
      widgetApi: widget.api,
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
