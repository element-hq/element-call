/*
Copyright 2021-2022 New Vector Ltd

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

// We need to import this somewhere, once, so that the correct 'request'
// function gets set. It needs to be not in the same file as we use
// createClient, or the typescript transpiler gets confused about
// dependency references.
import "matrix-js-sdk/src/browser-index";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserHistory } from "history";
import "./index.css";
import { logger } from "matrix-js-sdk/src/logger";
import {
  setLogExtension as setLKLogExtension,
  setLogLevel,
} from "livekit-client";

import { App } from "./App";
import { init as initRageshake } from "./settings/rageshake";
import { Initializer } from "./initializer";

initRageshake().catch((e) => {
  logger.error("Failed to initialize rageshake", e);
});

setLogLevel("debug");
setLKLogExtension(global.mx_rage_logger.log);

logger.info(`Element Call ${import.meta.env.VITE_APP_VERSION || "dev"}`);

const root = createRoot(document.getElementById("root")!);

let fatalError: Error | null = null;

if (!window.isSecureContext) {
  fatalError = new Error(
    "This app cannot run in an insecure context. To fix this, access the app " +
      "via a local loopback address, or serve it over HTTPS.\n" +
      "https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts",
  );
} else if (!navigator.mediaDevices) {
  fatalError = new Error("Your browser does not support WebRTC.");
}

if (fatalError !== null) {
  root.render(fatalError.message);
  throw fatalError; // Stop the app early
}

Initializer.initBeforeReact();

const history = createBrowserHistory();

root.render(
  <StrictMode>
    <App history={history} />
  </StrictMode>,
);
