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
import React, { Suspense, useState } from "react";
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

const SentryRoute = Sentry.withSentryRouting(Route);

interface AppProps {
  history: History;
}

export default function App({ history }: AppProps) {
  const [loadingOlm, setLoadingOlm] = useState(false);

  usePageFocusStyle();

  // TODO: https://gitlab.matrix.org/matrix-org/olm/-/issues/10
  window.OLM_OPTIONS = {};
  Olm.init({ locateFile: () => olmWasmPath }).then(() => setLoadingOlm(false));

  const errorPage = <CrashView />;

  if (loadingOlm) {
    return <LoadingView />;
  }

  return (
    <Router history={history}>
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
    </Router>
  );
}
