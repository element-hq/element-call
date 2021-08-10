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
import { useConferenceCallManager } from "./ConferenceCallManagerHooks";
import { JoinOrCreateRoom } from "./JoinOrCreateRoom";
import { LoginOrRegister } from "./LoginOrRegister";
import { Room } from "./Room";

export default function App() {
  const { protocol, host } = window.location;
  // Assume homeserver is hosted on same domain (proxied in development by vite)
  const homeserverUrl = `${protocol}//${host}`;
  const { loading, authenticated, error, manager, login, register } =
    useConferenceCallManager(homeserverUrl);

  return (
    <Router>
      <div>
        {error && <p>{error.message}</p>}
        {loading ? (
          <p>Loading...</p>
        ) : (
          <Switch>
            <Route exact path="/">
              {authenticated ? (
                <JoinOrCreateRoom manager={manager} />
              ) : (
                <LoginOrRegister onRegister={register} onLogin={login} />
              )}
            </Route>
            <AuthenticatedRoute
              authenticated={authenticated}
              path="/room/:roomId"
            >
              <Room manager={manager} />
            </AuthenticatedRoute>
          </Switch>
        )}
      </div>
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
            pathname: "/",
            state: { from: location },
          }}
        />
      )}
    </Route>
  );
}
