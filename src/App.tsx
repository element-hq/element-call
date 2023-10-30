/*
Copyright 2021 - 2023 New Vector Ltd

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

import { FC, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  useLocation,
} from "react-router-dom";
import * as Sentry from "@sentry/react";
import { OverlayProvider } from "@react-aria/overlays";
import { History } from "history";
import { TooltipProvider } from "@vector-im/compound-web";
import WebConsole from "f-twelve";

import { HomePage } from "./home/HomePage";
import { LoginPage } from "./auth/LoginPage";
import { RegisterPage } from "./auth/RegisterPage";
import { RoomPage } from "./room/RoomPage";
import { ClientProvider } from "./ClientContext";
import { CrashView, LoadingView } from "./FullScreenView";
import { DisconnectedBanner } from "./DisconnectedBanner";
import { Initializer } from "./initializer";
import { MediaDevicesProvider } from "./livekit/MediaDevicesContext";
import { widget } from "./widget";
import { useTheme } from "./useTheme";

const SentryRoute = Sentry.withSentryRouting(Route);
WebConsole.enable({ show: false });

interface SimpleProviderProps {
  children: JSX.Element;
}

const BackgroundProvider: FC<SimpleProviderProps> = ({ children }) => {
  const { pathname } = useLocation();

  useEffect(() => {
    let backgroundImage = "";
    if (!["/login", "/register"].includes(pathname) && !widget) {
      backgroundImage = "var(--background-gradient)";
    }

    document.getElementsByTagName("body")[0].style.backgroundImage =
      backgroundImage;
  }, [pathname]);

  return <>{children}</>;
};
const ThemeProvider: FC<SimpleProviderProps> = ({ children }) => {
  useTheme();
  return children;
};

interface AppProps {
  history: History;
}

export const App: FC<AppProps> = ({ history }) => {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    Initializer.init()?.then(() => {
      if (loaded) return;
      setLoaded(true);
      widget?.api.sendContentLoaded();
    });
  });

  const errorPage = <CrashView />;

  return (
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    <Router history={history}>
      <BackgroundProvider>
        <ThemeProvider>
          <TooltipProvider>
            {loaded ? (
              <Suspense fallback={null}>
                <ClientProvider>
                  <MediaDevicesProvider>
                    <Sentry.ErrorBoundary fallback={errorPage}>
                      <OverlayProvider>
                        <DisconnectedBanner />
                        <Switch>
                          <SentryRoute exact path="/">
                            <HomePage />
                          </SentryRoute>
                          <SentryRoute exact path="/login">
                            <LoginPage />
                          </SentryRoute>
                          <SentryRoute exact path="/register">
                            <RegisterPage />
                          </SentryRoute>
                          <SentryRoute path="*">
                            <RoomPage />
                          </SentryRoute>
                        </Switch>
                      </OverlayProvider>
                    </Sentry.ErrorBoundary>
                  </MediaDevicesProvider>
                </ClientProvider>
              </Suspense>
            ) : (
              <LoadingView />
            )}
          </TooltipProvider>
        </ThemeProvider>
      </BackgroundProvider>
    </Router>
  );
};
