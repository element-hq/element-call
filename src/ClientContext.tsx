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
} from "react";
import { useHistory } from "react-router-dom";
import { MatrixClient, ClientEvent } from "matrix-js-sdk/src/client";
import { MatrixEvent } from "matrix-js-sdk/src/models/event";
import { logger } from "matrix-js-sdk/src/logger";

import { ErrorView } from "./FullScreenView";
import {
  initClient,
  defaultHomeserver,
  CryptoStoreIntegrityError,
} from "./matrix-utils";
import { widget } from "./widget";
import { PosthogAnalytics, RegistrationType } from "./PosthogAnalytics";

declare global {
  interface Window {
    matrixclient: MatrixClient;
  }
}

export interface Session {
  user_id: string;
  device_id: string;
  access_token: string;
  passwordlessUser: boolean;
  tempPassword?: string;
}

const loadSession = (): Session => {
  const data = localStorage.getItem("matrix-auth-store");
  if (data) return JSON.parse(data);
  return null;
};
const saveSession = (session: Session) =>
  localStorage.setItem("matrix-auth-store", JSON.stringify(session));
const clearSession = () => localStorage.removeItem("matrix-auth-store");

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
  const [
    { loading, isAuthenticated, isPasswordlessUser, client, userName, error },
    setState,
  ] = useState<ClientProviderState>({
    loading: true,
    isAuthenticated: false,
    isPasswordlessUser: false,
    client: undefined,
    userName: null,
    error: undefined,
  });

  useEffect(() => {
    const init = async (): Promise<
      Pick<ClientProviderState, "client" | "isPasswordlessUser">
    > => {
      if (widget) {
        // We're inside a widget, so let's engage *matryoshka mode*
        logger.log("Using a matryoshka client");
        PosthogAnalytics.instance.setRegistrationType(
          RegistrationType.Registered
        );
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
            PosthogAnalytics.instance.setRegistrationType(
              passwordlessUser
                ? RegistrationType.Guest
                : RegistrationType.Registered
            );
            return {
              client: await initClient(
                {
                  baseUrl: defaultHomeserver,
                  accessToken: access_token,
                  userId: user_id,
                  deviceId: device_id,
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
                    baseUrl: defaultHomeserver,
                    accessToken: access_token,
                    userId: user_id,
                    deviceId: device_id,
                  },
                  false // Don't need the crypto store just to log out
                );
                await client.logout(undefined, true);
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

    init()
      .then(({ client, isPasswordlessUser }) => {
        setState({
          client,
          loading: false,
          isAuthenticated: Boolean(client),
          isPasswordlessUser,
          userName: client?.getUserIdLocalpart(),
          error: undefined,
        });
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
        });
      });
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
        });
      }
    },
    [client]
  );

  const logout = useCallback(async () => {
    await client.logout(undefined, true);
    clearSession();
    setState({
      client: undefined,
      loading: false,
      isAuthenticated: false,
      isPasswordlessUser: true,
      userName: "",
      error: undefined,
    });
    history.push("/");
    PosthogAnalytics.instance.setRegistrationType(RegistrationType.Guest);
  }, [history, client]);

  useEffect(() => {
    // To protect against multiple sessions writing to the same storage
    // simultaneously, we send a to-device message that shuts down all other
    // running instances of the app. This isn't necessary if the app is running
    // in a widget though, since then it'll be mostly stateless.
    if (!widget && client) {
      const loadTime = Date.now();

      const onToDeviceEvent = (event: MatrixEvent) => {
        if (event.getType() !== "org.matrix.call_duplicate_session") return;

        const content = event.getContent();

        if (content.session_id === client.getSessionId()) return;

        if (content.timestamp > loadTime) {
          client?.stopClient();

          setState((prev) => ({
            ...prev,
            error: new Error(
              "This application has been opened in another tab."
            ),
          }));
        }
      };

      client.on(ClientEvent.ToDeviceEvent, onToDeviceEvent);

      client.sendToDevice("org.matrix.call_duplicate_session", {
        [client.getUserId()]: {
          "*": { session_id: client.getSessionId(), timestamp: loadTime },
        },
      });

      return () => {
        client?.removeListener(ClientEvent.ToDeviceEvent, onToDeviceEvent);
      };
    }
  }, [client]);

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
    ]
  );

  useEffect(() => {
    window.matrixclient = client;
  }, [client]);

  if (error) {
    return <ErrorView error={error} />;
  }

  return (
    <ClientContext.Provider value={context}>{children}</ClientContext.Provider>
  );
};

export const useClient = () => useContext(ClientContext);
