/*
Copyright 2021-2022 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, {
  FC,
  useCallback,
  useEffect,
  useState,
  createContext,
  useMemo,
  useContext,
  useRef,
} from "react";
import { useHistory } from "react-router-dom";
import { ClientEvent, MatrixClient } from "matrix-js-sdk/src/client";
import { logger } from "matrix-js-sdk/src/logger";
import { useTranslation } from "react-i18next";
import { ISyncStateData, SyncState } from "matrix-js-sdk/src/sync";

import { ErrorView } from "./FullScreenView";
import {
  initClient,
  CryptoStoreIntegrityError,
  fallbackICEServerAllowed,
} from "./matrix-utils";
import { widget } from "./widget";
import {
  PosthogAnalytics,
  RegistrationType,
} from "./analytics/PosthogAnalytics";
import { translatedError } from "./TranslatedError";
import { useEventTarget } from "./useEvents";
import { Config } from "./config/Config";

declare global {
  interface Window {
    matrixclient: MatrixClient;
    isPasswordlessUser: boolean;
  }
}

export interface Session {
  user_id: string;
  device_id: string;
  access_token: string;
  passwordlessUser: boolean;
  tempPassword?: string;
}

const loadChannel =
  "BroadcastChannel" in window ? new BroadcastChannel("load") : null;

const loadSession = (): Session => {
  const data = localStorage.getItem("matrix-auth-store");
  if (data) return JSON.parse(data);
  return null;
};
const saveSession = (session: Session) =>
  localStorage.setItem("matrix-auth-store", JSON.stringify(session));
const clearSession = () => localStorage.removeItem("matrix-auth-store");
const isDisconnected = (syncState, syncData) =>
  syncState === "ERROR" && syncData?.error?.name === "ConnectionError";

interface ClientState {
  loading: boolean;
  isAuthenticated: boolean;
  isPasswordlessUser: boolean;
  client: MatrixClient;
  userName: string;
  changePassword: (password: string) => Promise<void>;
  logout: () => void;
  setClient: (client: MatrixClient, session: Session) => void;
  error?: Error;
  disconnected: boolean;
}

const ClientContext = createContext<ClientState>(null);

type ClientProviderState = Omit<
  ClientState,
  "changePassword" | "logout" | "setClient"
> & { error?: Error };

interface Props {
  children: JSX.Element;
}

export const ClientProvider: FC<Props> = ({ children }) => {
  const history = useHistory();
  const initializing = useRef(false);
  const [
    {
      loading,
      isAuthenticated,
      isPasswordlessUser,
      client,
      userName,
      error,
      disconnected,
    },
    setState,
  ] = useState<ClientProviderState>({
    loading: true,
    isAuthenticated: false,
    isPasswordlessUser: false,
    client: undefined,
    userName: null,
    error: undefined,
    disconnected: false,
  });

  const onSync = (state: SyncState, _old: SyncState, data: ISyncStateData) => {
    setState((currentState) => {
      const disconnected = isDisconnected(state, data);
      return disconnected === currentState.disconnected
        ? currentState
        : { ...currentState, disconnected };
    });
  };

  useEffect(() => {
    // In case the component is mounted, unmounted, and remounted quickly (as
    // React does in strict mode), we need to make sure not to doubly initialize
    // the client
    if (initializing.current) return;
    initializing.current = true;

    const init = async (): Promise<
      Pick<ClientProviderState, "client" | "isPasswordlessUser">
    > => {
      if (widget) {
        // We're inside a widget, so let's engage *matryoshka mode*
        logger.log("Using a matryoshka client");
        return {
          client: await widget.client,
          isPasswordlessUser: false,
        };
      } else {
        // We're running as a standalone application
        try {
          const session = loadSession();
          if (!session) return { client: undefined, isPasswordlessUser: false };

          logger.log("Using a standalone client");

          /* eslint-disable camelcase */
          const { user_id, device_id, access_token, passwordlessUser } =
            session;

          try {
            return {
              client: await initClient(
                {
                  baseUrl: Config.defaultHomeserverUrl(),
                  accessToken: access_token,
                  userId: user_id,
                  deviceId: device_id,
                  fallbackICEServerAllowed: fallbackICEServerAllowed,
                },
                true
              ),
              isPasswordlessUser: passwordlessUser,
            };
          } catch (err) {
            if (err instanceof CryptoStoreIntegrityError) {
              // We can't use this session anymore, so let's log it out
              try {
                const client = await initClient(
                  {
                    baseUrl: Config.defaultHomeserverUrl(),
                    accessToken: access_token,
                    userId: user_id,
                    deviceId: device_id,
                    fallbackICEServerAllowed: fallbackICEServerAllowed,
                  },
                  false // Don't need the crypto store just to log out
                );
                await client.logout(true);
              } catch (err_) {
                logger.warn(
                  "The previous session was lost, and we couldn't log it out, " +
                    "either"
                );
              }
            }
            throw err;
          }
          /* eslint-enable camelcase */
        } catch (err) {
          clearSession();
          throw err;
        }
      }
    };
    let clientWithListener: MatrixClient;
    init()
      .then(({ client, isPasswordlessUser }) => {
        clientWithListener = client;
        setState({
          client,
          loading: false,
          isAuthenticated: Boolean(client),
          isPasswordlessUser,
          userName: client?.getUserIdLocalpart(),
          error: undefined,
          disconnected: isDisconnected(
            client?.getSyncState,
            client?.getSyncStateData
          ),
        });
        clientWithListener?.on(ClientEvent.Sync, onSync);
      })
      .catch((err) => {
        logger.error(err);
        setState({
          client: undefined,
          loading: false,
          isAuthenticated: false,
          isPasswordlessUser: false,
          userName: null,
          error: undefined,
          disconnected: false,
        });
      })
      .finally(() => (initializing.current = false));
    return () => {
      clientWithListener?.removeListener(ClientEvent.Sync, onSync);
    };
  }, []);

  const changePassword = useCallback(
    async (password: string) => {
      const { tempPassword, ...session } = loadSession();

      await client.setPassword(
        {
          type: "m.login.password",
          identifier: {
            type: "m.id.user",
            user: session.user_id,
          },
          user: session.user_id,
          password: tempPassword,
        },
        password
      );

      saveSession({ ...session, passwordlessUser: false });

      setState({
        client,
        loading: false,
        isAuthenticated: true,
        isPasswordlessUser: false,
        userName: client.getUserIdLocalpart(),
        error: undefined,
        disconnected: false,
      });
    },
    [client]
  );

  const setClient = useCallback(
    (newClient: MatrixClient, session: Session) => {
      if (client && client !== newClient) {
        client.stopClient();
      }

      if (newClient) {
        saveSession(session);

        setState({
          client: newClient,
          loading: false,
          isAuthenticated: true,
          isPasswordlessUser: session.passwordlessUser,
          userName: newClient.getUserIdLocalpart(),
          error: undefined,
          disconnected: isDisconnected(
            newClient.getSyncState(),
            newClient.getSyncStateData()
          ),
        });
      } else {
        clearSession();

        setState({
          client: undefined,
          loading: false,
          isAuthenticated: false,
          isPasswordlessUser: false,
          userName: null,
          error: undefined,
          disconnected: false,
        });
      }
    },
    [client]
  );

  const logout = useCallback(async () => {
    await client.logout(true);
    await client.clearStores();
    clearSession();
    setState({
      client: undefined,
      loading: false,
      isAuthenticated: false,
      isPasswordlessUser: true,
      userName: "",
      error: undefined,
      disconnected: false,
    });
    history.push("/");
    PosthogAnalytics.instance.setRegistrationType(RegistrationType.Guest);
  }, [history, client]);

  const { t } = useTranslation();

  // To protect against multiple sessions writing to the same storage
  // simultaneously, we send a broadcast message that shuts down all other
  // running instances of the app. This isn't necessary if the app is running in
  // a widget though, since then it'll be mostly stateless.
  useEffect(() => {
    if (!widget) loadChannel?.postMessage({});
  }, []);

  useEventTarget(
    loadChannel,
    "message",
    useCallback(() => {
      client?.stopClient();

      setState((prev) => ({
        ...prev,
        error: translatedError(
          "This application has been opened in another tab.",
          t
        ),
      }));
    }, [client, setState, t])
  );

  const context = useMemo<ClientState>(
    () => ({
      loading,
      isAuthenticated,
      isPasswordlessUser,
      client,
      changePassword,
      logout,
      userName,
      setClient,
      error: undefined,
      disconnected,
    }),
    [
      loading,
      isAuthenticated,
      isPasswordlessUser,
      client,
      changePassword,
      logout,
      userName,
      setClient,
      disconnected,
    ]
  );

  useEffect(() => {
    window.matrixclient = client;
    window.isPasswordlessUser = isPasswordlessUser;

    if (PosthogAnalytics.hasInstance())
      PosthogAnalytics.instance.onLoginStatusChanged();
  }, [client, isPasswordlessUser]);

  if (error) {
    return <ErrorView error={error} />;
  }

  return (
    <ClientContext.Provider value={context}>{children}</ClientContext.Provider>
  );
};

export const useClient = () => useContext(ClientContext);
