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

import React, { useCallback, useRef, useState } from "react";
import { useHistory, useLocation, Link } from "react-router-dom";
import { Header, HeaderLogo, LeftNav } from "./Header";
import { FieldRow, InputField, Button, ErrorMessage } from "./Input";
import { Center, Content, Info, Modal } from "./Layout";

export function LoginPage({ onLogin }) {
  const [homeserver, setHomeServer] = useState(
    `${window.location.protocol}//${window.location.host}`
  );
  const usernameRef = useRef();
  const passwordRef = useRef();
  const history = useHistory();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState();

  const onSubmitLoginForm = useCallback(
    (e) => {
      e.preventDefault();
      setLoading(true);

      onLogin(homeserver, usernameRef.current.value, passwordRef.current.value)
        .then(() => {
          if (location.state && location.state.from) {
            history.replace(location.state.from);
          } else {
            history.replace("/");
          }
        })
        .catch((error) => {
          setError(error);
          setLoading(false);
        });
    },
    [onLogin, location, history, homeserver]
  );

  return (
    <>
      <Header>
        <LeftNav>
          <HeaderLogo />
        </LeftNav>
      </Header>
      <Content>
        <Center>
          {loading ? (
            <div>Loading...</div>
          ) : (
            <Modal>
              <h2>Login</h2>
              <form onSubmit={onSubmitLoginForm}>
                <FieldRow>
                  <InputField
                    type="text"
                    value={homeserver}
                    onChange={(e) => setHomeServer(e.target.value)}
                    placeholder="Homeserver"
                    label="Homeserver"
                    autoCorrect="off"
                    autoCapitalize="none"
                  />
                </FieldRow>
                <FieldRow>
                  <InputField
                    type="text"
                    ref={usernameRef}
                    placeholder="Username"
                    label="Username"
                    autoCorrect="off"
                    autoCapitalize="none"
                  />
                </FieldRow>
                <FieldRow>
                  <InputField
                    type="password"
                    ref={passwordRef}
                    placeholder="Password"
                    label="Password"
                  />
                </FieldRow>
                {error && (
                  <FieldRow>
                    <ErrorMessage>{error.message}</ErrorMessage>
                  </FieldRow>
                )}
                <FieldRow rightAlign>
                  <Button type="submit">Login</Button>
                </FieldRow>
              </form>
              <Info>
                New?{" "}
                <Link
                  to={{
                    pathname: "/register",
                    state: location.state,
                  }}
                >
                  Create account
                </Link>
              </Info>
            </Modal>
          )}
        </Center>
      </Content>
    </>
  );
}
