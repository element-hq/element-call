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

import { HomePage } from "./home/HomePage";
import { LoginPage } from "./auth/LoginPage";
import { RegisterPage } from "./auth/RegisterPage";
import { RoomPage } from "./room/RoomPage";
import { ClientProvider } from "./ClientContext";
import { CrashView, LoadingView } from "./FullScreenView";
import { DisconnectedBanner } from "./DisconnectedBanner";
import { Initializer } from "./initializer";
import { MediaDevicesProvider } from "./livekit/MediaDevicesContext";
import { useUrlParams } from "./UrlParams";
import { widget } from "./widget";

const SentryRoute = Sentry.withSentryRouting(Route);

interface BackgroundProviderProps {
  children: JSX.Element;
}

const BackgroundProvider: FC<BackgroundProviderProps> = ({ children }) => {
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

interface ThemeProviderProps {
  children: JSX.Element;
}

const ThemeProvider: FC<ThemeProviderProps> = ({ children }) => {
  const { theme } = useUrlParams();
  const [previousTheme, setCurrentTheme] = useState<string | null>(
    document.body.classList.item(0),
  );
  useEffect(() => {
    // Don't update the current theme if the url does not contain a theme prop.
    if (!theme) return;
    const themeString = "cpd-theme-" + (theme ?? "dark");
    if (themeString !== previousTheme) {
      if (previousTheme) {
        document.body.classList.remove(previousTheme);
      }
      document.body.classList.add(themeString);
      setCurrentTheme(themeString);
    }
  }, [previousTheme, theme]);

  return <>{children}</>;
};

interface AppProps {
  history: History;
}

export const App: FC<AppProps> = ({ history }) => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Initializer.init()?.then(() => {
      setLoaded(true);
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
