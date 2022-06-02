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

// We need to import this somewhere, once, so that the correct 'request'
// function gets set. It needs to be not in the same file as we use
// createClient, or the typescript transpiler gets confused about
// dependency references.
import "matrix-js-sdk/src/browser-index";

import React from "react";
import ReactDOM from "react-dom";
import { createBrowserHistory } from "history";
import "./index.css";
import App from "./App";
import * as Sentry from "@sentry/react";
import { Integrations } from "@sentry/tracing";
import { ErrorView } from "./FullScreenView";
import { init as initRageshake } from "./settings/rageshake";
import { InspectorContextProvider } from "./room/GroupCallInspector";

initRageshake();

console.info(`matrix-video-chat ${import.meta.env.VITE_APP_VERSION || "dev"}`);

if (import.meta.env.VITE_CUSTOM_THEME) {
  const style = document.documentElement.style;
  style.setProperty("--primaryColor", import.meta.env.VITE_PRIMARY_COLOR);
  style.setProperty("--bgColor1", import.meta.env.VITE_BG_COLOR_1);
  style.setProperty("--bgColor2", import.meta.env.VITE_BG_COLOR_2);
  style.setProperty("--bgColor3", import.meta.env.VITE_BG_COLOR_3);
  style.setProperty("--bgColor4", import.meta.env.VITE_BG_COLOR_4);
  style.setProperty("--bgColor5", import.meta.env.VITE_BG_COLOR_5);
  style.setProperty("--textColor1", import.meta.env.VITE_TEXT_COLOR_1);
  style.setProperty("--textColor2", import.meta.env.VITE_TEXT_COLOR_2);
  style.setProperty("--textColor4", import.meta.env.VITE_TEXT_COLOR_4);
  style.setProperty(
    "--inputBorderColor",
    import.meta.env.VITE_INPUT_BORDER_COLOR
  );
  style.setProperty(
    "--inputBorderColorFocused",
    import.meta.env.VITE_INPUT_BORDER_COLOR_FOCUSED
  );
}

const history = createBrowserHistory();

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? "production",
  integrations: [
    new Integrations.BrowserTracing({
      routingInstrumentation: Sentry.reactRouterV5Instrumentation(history),
    }),
  ],
  tracesSampleRate: 1.0,
});

ReactDOM.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={ErrorView}>
      <InspectorContextProvider>
        <App history={history} />
      </InspectorContextProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
  document.getElementById("root")
);
