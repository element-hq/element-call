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
import { useClient } from "./ConferenceCallManagerHooks";
import { Home } from "./Home";
import { Room } from "./Room";
import { RegisterPage } from "./RegisterPage";
import { LoginPage } from "./LoginPage";
import { Center } from "./Layout";
import { GuestAuthPage } from "./GuestAuthPage";

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
            <Route exact path="/login">
              <LoginPage onLogin={login} />
            </Route>
            <Route exact path="/register">
              <RegisterPage onRegister={register} />
            </Route>
            <Route path="/room/:roomId">
              {authenticated ? (
                <Room client={client} />
              ) : (
                <GuestAuthPage onRegisterGuest={registerGuest} />
              )}
            </Route>
          </Switch>
        )}
      </>
    </Router>
  );
}

function AuthenticatedRoute({ authenticated, children, ...rest }) {
  const location = useLocation();

  return (
    <Route {...rest}>
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
    </Route>
  );
}
