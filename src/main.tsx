/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// We need to import this somewhere, once, so that the correct 'request'
// function gets set. It needs to be not in the same file as we use
// createClient, or the typescript transpiler gets confused about
// dependency references.
import "matrix-js-sdk/lib/browser-index";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  setLogExtension as setLKLogExtension,
  setLogLevel as setLKLogLevel,
} from "livekit-client";

import { App } from "./App";
import { init as initRageshake } from "./settings/rageshake";
import { Initializer } from "./initializer";
import { AppViewModel } from "./state/AppViewModel";
import { globalScope } from "./state/ObservableScope";

window.setLKLogLevel = setLKLogLevel;

initRageshake().catch((e) => {
  logger.error("Failed to initialize rageshake", e);
});
setLKLogLevel("info");
setLKLogExtension((level, msg, context) => {
  // we pass a synthetic logger name of "livekit" to the rageshake to make it easier to read
  global.mx_rage_logger.log(level, "livekit", msg, context);
});

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

Initializer.initBeforeReact()
  .then(() => {
    root.render(
      <StrictMode>
        <App vm={new AppViewModel(globalScope)} />
      </StrictMode>,
    );
  })
  .catch((e) => {
    logger.error("Failed to initialize app", e);
    root.render(e.message);
  });
