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

import { ErrorView } from "./FullScreenView";
import { initClient, defaultHomeserver } from "./matrix-utils";

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
  error: Error;
}

const ClientContext = createContext<ClientState>(null);

type ClientProviderState = Omit<
  ClientState,
  "changePassword" | "logout" | "setClient"
> & { error?: Error };

export const ClientProvider: FC = ({ children }) => {
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
    const restore = async (): Promise<
      Pick<ClientProviderState, "client" | "isPasswordlessUser">
    > => {
      try {
        const session = loadSession();

        if (session) {
          /* eslint-disable camelcase */
          const { user_id, device_id, access_token, passwordlessUser } =
            session;

          const client = await initClient({
            baseUrl: defaultHomeserver,
            accessToken: access_token,
            userId: user_id,
            deviceId: device_id,
          });
          /* eslint-enable camelcase */

          return { client, isPasswordlessUser: passwordlessUser };
        }

        return { client: undefined, isPasswordlessUser: false };
      } catch (err) {
        console.error(err);
        clearSession();
        throw err;
      }
    };

    restore()
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
      .catch(() => {
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

  const logout = useCallback(() => {
    clearSession();
    history.push("/");
  }, [history]);

  useEffect(() => {
    if (client) {
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
