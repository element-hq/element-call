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

import {
  FC,
  useCallback,
  useEffect,
  useState,
  createContext,
  useContext,
  useRef,
  useMemo,
} from "react";
import { useHistory } from "react-router-dom";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { logger } from "matrix-js-sdk/src/logger";
import { useTranslation } from "react-i18next";

import { ErrorView } from "./FullScreenView";
import {
  CryptoStoreIntegrityError,
  fallbackICEServerAllowed,
  initClient,
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
    passwordlessUser: boolean;
  }
}

export type ClientState = ValidClientState | ErrorState;

export type ValidClientState = {
  state: "valid";
  authenticated?: AuthenticatedClient;
  setClient: (params?: SetClientParams) => void;
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

export type SetClientParams = {
  client: MatrixClient;
  session: Session;
};

const ClientContext = createContext<ClientState | undefined>(undefined);

export const useClientState = () => useContext(ClientContext);

export function useClient(): {
  client?: MatrixClient;
  setClient?: (params?: SetClientParams) => void;
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
  setClient?: (params?: SetClientParams) => void;
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
    authenticated = !client;
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
  const history = useHistory();

  const [initClientState, setInitClientState] = useState<
    InitResult | undefined
  >(undefined);

  const initializing = useRef(false);
  useEffect(() => {
    // In case the component is mounted, unmounted, and remounted quickly (as
    // React does in strict mode), we need to make sure not to doubly initialize
    // the client.
    if (initializing.current) return;
    initializing.current = true;

    loadClient()
      .then((maybeClient) => {
        if (!maybeClient) {
          logger.error("Failed to initialize client");
          return;
        }

        setInitClientState(maybeClient);
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
        password
      );

      saveSession({ ...session, passwordlessUser: false });

      setInitClientState({
        client: initClientState.client,
        passwordlessUser: false,
      });
    },
    [initClientState?.client]
  );

  const setClient = useCallback(
    (clientParams?: SetClientParams) => {
      const oldClient = initClientState?.client;
      const newClient = clientParams?.client;
      if (oldClient && oldClient !== newClient) {
        oldClient.stopClient();
      }

      if (clientParams) {
        saveSession(clientParams.session);
        setInitClientState({
          client: clientParams.client,
          passwordlessUser: clientParams.session.passwordlessUser,
        });
      } else {
        clearSession();
        setInitClientState(undefined);
      }
    },
    [initClientState?.client]
  );

  const logout = useCallback(async () => {
    const client = initClientState?.client;
    if (!client) {
      return;
    }

    await client.logout(true);
    await client.clearStores();
    clearSession();
    setInitClientState(undefined);
    history.push("/");
    PosthogAnalytics.instance.setRegistrationType(RegistrationType.Guest);
  }, [history, initClientState?.client]);

  const { t } = useTranslation();

  // To protect against multiple sessions writing to the same storage
  // simultaneously, we send a broadcast message that shuts down all other
  // running instances of the app. This isn't necessary if the app is running in
  // a widget though, since then it'll be mostly stateless.
  useEffect(() => {
    if (!widget) loadChannel?.postMessage({});
  }, []);

  const [alreadyOpenedErr, setAlreadyOpenedErr] = useState<Error | undefined>(
    undefined
  );
  useEventTarget(
    loadChannel,
    "message",
    useCallback(() => {
      initClientState?.client.stopClient();
      setAlreadyOpenedErr(
        translatedError("This application has been opened in another tab.", t)
      );
    }, [initClientState?.client, setAlreadyOpenedErr, t])
  );

  const state: ClientState = useMemo(() => {
    if (alreadyOpenedErr) {
      return { state: "error", error: alreadyOpenedErr };
    }

    let authenticated = undefined;
    if (initClientState) {
      authenticated = {
        client: initClientState.client,
        isPasswordlessUser: initClientState.passwordlessUser,
        changePassword,
        logout,
      };
    }

    return { state: "valid", authenticated, setClient };
  }, [alreadyOpenedErr, changePassword, initClientState, logout, setClient]);

  useEffect(() => {
    if (!initClientState) {
      return;
    }

    window.matrixclient = initClientState.client;
    window.passwordlessUser = initClientState.passwordlessUser;

    if (PosthogAnalytics.hasInstance())
      PosthogAnalytics.instance.onLoginStatusChanged();
  }, [initClientState]);

  if (alreadyOpenedErr) {
    return <ErrorView error={alreadyOpenedErr} />;
  }

  return (
    <ClientContext.Provider value={state}>{children}</ClientContext.Provider>
  );
};

type InitResult = {
  client: MatrixClient;
  passwordlessUser: boolean;
};

async function loadClient(): Promise<InitResult> {
  if (widget) {
    // We're inside a widget, so let's engage *matryoshka mode*
    logger.log("Using a matryoshka client");
    const client = await widget.client;
    return {
      client,
      passwordlessUser: false,
    };
  } else {
    // We're running as a standalone application
    try {
      const session = loadSession();
      if (!session) {
        throw new Error("No session stored");
      }

      logger.log("Using a standalone client");

      const foci = Config.get().livekit
        ? [{ livekitServiceUrl: Config.get().livekit!.livekit_service_url }]
        : undefined;

      /* eslint-disable camelcase */
      const { user_id, device_id, access_token, passwordlessUser } = session;
      const initClientParams = {
        baseUrl: Config.defaultHomeserverUrl()!,
        accessToken: access_token,
        userId: user_id,
        deviceId: device_id,
        fallbackICEServerAllowed: fallbackICEServerAllowed,
        foci,
      };

      try {
        const client = await initClient(initClientParams, true);
        return {
          client,
          passwordlessUser,
        };
      } catch (err) {
        if (err instanceof CryptoStoreIntegrityError) {
          // We can't use this session anymore, so let's log it out
          try {
            const client = await initClient(initClientParams, false); // Don't need the crypto store just to log out)
            await client.logout(true);
          } catch (err) {
            logger.warn(
              "The previous session was lost, and we couldn't log it out, " +
                err +
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
}

export interface Session {
  user_id: string;
  device_id: string;
  access_token: string;
  passwordlessUser: boolean;
  tempPassword?: string;
}

const clearSession = () => localStorage.removeItem("matrix-auth-store");
const saveSession = (s: Session) =>
  localStorage.setItem("matrix-auth-store", JSON.stringify(s));
const loadSession = (): Session | undefined => {
  const data = localStorage.getItem("matrix-auth-store");
  if (!data) {
    return undefined;
  }

  return JSON.parse(data);
};
