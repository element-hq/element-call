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

import React, { useCallback, useRef } from "react";

export function LoginOrRegister({ onRegister, onLogin }) {
  const registerUsernameRef = useRef();
  const registerPasswordRef = useRef();
  const loginUsernameRef = useRef();
  const loginPasswordRef = useRef();

  const onSubmitRegisterForm = useCallback((e) => {
    e.preventDefault();
    onRegister(
      registerUsernameRef.current.value,
      registerPasswordRef.current.value
    );
  });

  const onSubmitLoginForm = useCallback((e) => {
    e.preventDefault();
    onLogin(loginUsernameRef.current.value, loginPasswordRef.current.value);
  });

  return (
    <div className="page">
      <h1>Matrix Video Chat</h1>
      <h2>Register</h2>
      <form onSubmit={onSubmitRegisterForm}>
        <input
          type="text"
          ref={registerUsernameRef}
          placeholder="Username"
        ></input>
        <input
          type="password"
          ref={registerPasswordRef}
          placeholder="Password"
        ></input>
        <button type="submit">Register</button>
      </form>
      <h2>Login</h2>
      <form onSubmit={onSubmitLoginForm}>
        <input
          type="text"
          ref={loginUsernameRef}
          placeholder="Username"
        ></input>
        <input
          type="password"
          ref={loginPasswordRef}
          placeholder="Password"
        ></input>
        <button type="submit">Login</button>
      </form>
    </div>
  );
}
