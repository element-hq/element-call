/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type JSX, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, useLocation, Routes } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { TooltipProvider } from "@vector-im/compound-web";
import { logger } from "matrix-js-sdk/lib/logger";
import { type MatrixClient } from "matrix-js-sdk";
import { I18nextProvider } from "react-i18next";

import { HomePage } from "./home/HomePage";
import { LoginPage } from "./auth/LoginPage";
import { RegisterPage } from "./auth/RegisterPage";
import { RoomPage } from "./room/RoomPage";
import { ClientProvider } from "./ClientContext";
import { ErrorPage, LoadingPage } from "./FullScreenView";
import { Initializer } from "./initializer";
import { type WidgetHelpers } from "./widget";
import { useTheme } from "./useTheme";
import { ProcessorProvider } from "./livekit/TrackProcessorContext";
import { type AppViewModel } from "./state/AppViewModel";
import { MediaDevicesContext } from "./MediaDevicesContext";
import {
  HeaderStyle,
  UrlParamsProvider,
  useUrlParams,
  useUrlParamsFromLocation,
} from "./UrlParams";
import { AppBar } from "./AppBar";
import { i18n } from "./utils/i18n";
import { useRootElement } from "./RootElementContext";
import {
  createWidgetHostBridge,
  HostBridgeProvider,
  nullHostBridge,
} from "./HostBridge";
import { useInitial } from "./useInitial";

const SentryRoute = Sentry.withSentryReactRouterV7Routing(Route);

interface SimpleProviderProps {
  children: JSX.Element;
}

/**
 * Supplies the URL-derived params to the rest of the app. Only the standalone
 * and widget builds own the URL, so this lives here in the app shell rather
 * than alongside the context itself.
 */
const LocationUrlParamsProvider: FC<SimpleProviderProps> = ({ children }) => {
  const urlParams = useUrlParamsFromLocation();
  return <UrlParamsProvider value={urlParams}>{children}</UrlParamsProvider>;
};

const BackgroundProvider: FC<SimpleProviderProps> = ({ children }) => {
  const { pathname } = useLocation();
  const { background } = useUrlParams();
  const rootElement = useRootElement();

  useEffect(() => {
    rootElement.setAttribute("data-background", background);
  }, [pathname, background, rootElement]);

  return children;
};

const ThemeProvider: FC<SimpleProviderProps> = ({ children }) => {
  useTheme();
  return children;
};

/** Wraps the app in an {@link AppBar}, if the params ask for one. */
const MaybeAppBar: FC<SimpleProviderProps> = ({ children }) => {
  const { header } = useUrlParams();
  return header === HeaderStyle.AppBar ? <AppBar>{children}</AppBar> : children;
};

interface Props {
  vm: AppViewModel;
  /** A point of access to the widget API, if running as a widget. */
  widget: WidgetHelpers | null;
}

export const App: FC<Props> = ({ vm, widget }) => {
  // The standalone build has no host; the widget build's host is the client it
  // is a widget of.
  const hostBridge = useInitial(() =>
    widget === null ? nullHostBridge : createWidgetHostBridge(widget),
  );
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    Initializer.init()
      ?.then(async () => {
        if (loaded) return;
        setLoaded(true);
        await hostBridge.contentLoaded();
      })
      .catch(logger.error);
  });

  // As a widget, the client comes from the host over the widget API. Standalone,
  // Element Call finds one itself, so there is nothing to wait for here.
  const [widgetClient, setWidgetClient] = useState<MatrixClient | undefined>(
    undefined,
  );
  useEffect(() => {
    if (widget === null) return;
    widget.client
      .then(setWidgetClient)
      .catch((e) => logger.error("Failed to obtain the host's client", e));
  }, [widget]);
  const clientReady = widget === null || widgetClient !== undefined;

  const content =
    loaded && clientReady ? (
      <ClientProvider client={widgetClient}>
        <MediaDevicesContext value={vm.mediaDevices}>
          <ProcessorProvider>
            <Sentry.ErrorBoundary
              fallback={(error) => <ErrorPage error={error} />}
            >
              <Routes>
                <SentryRoute path="/" element={<HomePage />} />
                <SentryRoute path="/login" element={<LoginPage />} />
                <SentryRoute path="/register" element={<RegisterPage />} />
                <SentryRoute path="*" element={<RoomPage />} />
              </Routes>
            </Sentry.ErrorBoundary>
          </ProcessorProvider>
        </MediaDevicesContext>
      </ClientProvider>
    ) : (
      <LoadingPage />
    );

  return (
    <I18nextProvider i18n={i18n}>
      <HostBridgeProvider value={hostBridge}>
        <BrowserRouter>
          <LocationUrlParamsProvider>
            <BackgroundProvider>
              <ThemeProvider>
                <TooltipProvider>
                  <Suspense fallback={null}>
                    <MaybeAppBar>{content}</MaybeAppBar>
                  </Suspense>
                </TooltipProvider>
              </ThemeProvider>
            </BackgroundProvider>
          </LocationUrlParamsProvider>
        </BrowserRouter>
      </HostBridgeProvider>
    </I18nextProvider>
  );
};
