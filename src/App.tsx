/*
Copyright 2021 New Vector Ltd

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

import Olm from "@matrix-org/olm";
import olmWasmPath from "@matrix-org/olm/olm.wasm?url";
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
import { Config } from "./config/Config";

const SentryRoute = Sentry.withSentryRouting(Route);

interface AppProps {
  history: History;
  onConfigLoaded: () => void;
}
enum LoadState {
  none,
  loading,
  loaded,
}

export default function App({ history, onConfigLoaded }: AppProps) {
  const [olmState, setOlmState] = useState(LoadState.none);
  const [configState, setConfigState] = useState(LoadState.none);

  usePageFocusStyle();

  useEffect(() => {
    if (olmState === LoadState.none) {
      setOlmState(LoadState.loading);
      // TODO: https://gitlab.matrix.org/matrix-org/olm/-/issues/10
      window.OLM_OPTIONS = {};
      Olm.init({ locateFile: () => olmWasmPath }).then(() =>
        setOlmState(LoadState.loaded)
      );
    }
    if (configState === LoadState.none) {
      setOlmState(LoadState.loading);
      Config.init().then(() => {
        setConfigState(LoadState.loaded);
        onConfigLoaded();
      });
    }
  }, [olmState, setOlmState, configState, setConfigState, onConfigLoaded]);

  const errorPage = <CrashView />;

  return (
    <Router history={history}>
      {olmState === LoadState.loaded && configState === LoadState.loaded ? (
        <Suspense fallback={null}>
          <ClientProvider>
            <InspectorContextProvider>
              <Sentry.ErrorBoundary fallback={errorPage}>
                <OverlayProvider>
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
          </ClientProvider>
        </Suspense>
      ) : (
        <LoadingView />
      )}
    </Router>
  );
}
