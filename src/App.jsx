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

import React from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Redirect,
  useLocation,
} from "react-router-dom";
import styles from "./App.module.css";
import { OverlayProvider } from "@react-aria/overlays";
import * as Sentry from "@sentry/react";
import { useClient } from "./ConferenceCallManagerHooks";
import { Home } from "./Home";
import { Room } from "./Room";
import { RegisterPage } from "./RegisterPage";
import { LoginPage } from "./LoginPage";
import { Center } from "./Layout";
import { GuestAuthPage } from "./GuestAuthPage";

const SentryRoute = Sentry.withSentryRouting(Route);

export default function App() {
  const { protocol, host } = window.location;
  // Assume homeserver is hosted on same domain (proxied in development by vite)
  const homeserverUrl = `${protocol}//${host}`;
  const {
    loading,
    authenticated,
    client,
    login,
    logout,
    registerGuest,
    register,
  } = useClient(homeserverUrl);

  return (
    <OverlayProvider className={styles.overlayProvider}>
      <Router>
        <>
          {loading ? (
            <Center>
              <p>Loading...</p>
            </Center>
          ) : (
            <Switch>
              <AuthenticatedRoute authenticated={authenticated} exact path="/">
                <Home client={client} onLogout={logout} />
              </AuthenticatedRoute>
              <SentryRoute exact path="/login">
                <LoginPage onLogin={login} />
              </SentryRoute>
              <SentryRoute exact path="/register">
                <RegisterPage onRegister={register} />
              </SentryRoute>
              <SentryRoute path="/room/:roomId?">
                {authenticated ? (
                  <Room client={client} onLogout={logout} />
                ) : (
                  <GuestAuthPage onLoginAsGuest={registerGuest} />
                )}
              </SentryRoute>
            </Switch>
          )}
        </>
      </Router>
    </OverlayProvider>
  );
}

function AuthenticatedRoute({ authenticated, children, ...rest }) {
  const location = useLocation();

  return (
    <SentryRoute {...rest}>
      {authenticated ? (
        children
      ) : (
        <Redirect
          to={{
            pathname: "/login",
            state: { from: location },
          }}
        />
      )}
    </SentryRoute>
  );
}
