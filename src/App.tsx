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

import React, { Suspense, useEffect, useState } from "react";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { OverlayProvider } from "@react-aria/overlays";

import { HomePage } from "./home/HomePage";
import { LoginPage } from "./auth/LoginPage";
import { RegisterPage } from "./auth/RegisterPage";
import { RoomPage } from "./room/RoomPage";
import { RoomRedirect } from "./room/RoomRedirect";
import { ClientProvider } from "./ClientContext";
import { usePageFocusStyle } from "./usePageFocusStyle";
import { SequenceDiagramViewerPage } from "./SequenceDiagramViewerPage";
import { InspectorContextProvider } from "./room/GroupCallInspector";
import { CrashView, LoadingView } from "./FullScreenView";
import { DisconnectedBanner } from "./DisconnectedBanner";
import { Initializer } from "./initializer";
import { MediaHandlerProvider } from "./settings/useMediaHandler";

const SentryRoute = Sentry.withSentryRouting(Route);

interface AppProps {
  history: History;
}

export default function App({ history }: AppProps) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Initializer.init()?.then(() => {
      setLoaded(true);
    });
  });

  usePageFocusStyle();

  const errorPage = <CrashView />;

  return (
    <Router history={history}>
      {loaded ? (
        <Suspense fallback={null}>
          <ClientProvider>
            <MediaHandlerProvider>
              <InspectorContextProvider>
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
                      <SentryRoute path="/room/:roomId?">
                        <RoomPage />
                      </SentryRoute>
                      <SentryRoute path="/inspector">
                        <SequenceDiagramViewerPage />
                      </SentryRoute>
                      <SentryRoute path="*">
                        <RoomRedirect />
                      </SentryRoute>
                    </Switch>
                  </OverlayProvider>
                </Sentry.ErrorBoundary>
              </InspectorContextProvider>
            </MediaHandlerProvider>
          </ClientProvider>
        </Suspense>
      ) : (
        <LoadingView />
      )}
    </Router>
  );
}
