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

import React, { useEffect } from "react";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { OverlayProvider } from "@react-aria/overlays";
import { Home } from "./Home";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";
import { Room } from "./Room";
import { ClientProvider } from "./ConferenceCallManagerHooks";
import { useFocusVisible } from "@react-aria/interactions";
import classNames from "classnames";
import styles from "./App.module.css";

const SentryRoute = Sentry.withSentryRouting(Route);

const { protocol, host } = window.location;
// Assume homeserver is hosted on same domain (proxied in development by vite)
const homeserverUrl = `${protocol}//${host}`;

export default function App() {
  const { isFocusVisible } = useFocusVisible();

  useEffect(() => {
    const classList = document.body.classList;
    const hasClass = classList.contains(styles.hideFocus);

    if (isFocusVisible && hasClass) {
      classList.remove(styles.hideFocus);
    } else if (!isFocusVisible && !hasClass) {
      classList.add(styles.hideFocus);
    }

    return () => {
      classList.remove(styles.hideFocus);
    };
  }, [isFocusVisible]);

  return (
    <Router>
      <ClientProvider homeserverUrl={homeserverUrl}>
        <OverlayProvider>
          <Switch>
            <SentryRoute exact path="/">
              <Home />
            </SentryRoute>
            <SentryRoute exact path="/login">
              <LoginPage />
            </SentryRoute>
            <SentryRoute exact path="/register">
              <RegisterPage />
            </SentryRoute>
            <SentryRoute path="/room/:roomId?">
              <Room />
            </SentryRoute>
          </Switch>
        </OverlayProvider>
      </ClientProvider>
    </Router>
  );
}
