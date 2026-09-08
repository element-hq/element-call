/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * EXPERIMENTAL
 *
 * Element Call as a React component, for an application that wants to show a
 * call inside itself rather than in an iframe.
 *
 * The host supplies the client and says which room to call in; Element Call
 * supplies the call. Everything it would otherwise take from the page it is on
 * — the URL, the document body, a Matrix session of its own — comes from the
 * host instead, or is confined to the container it is mounted in.
 */

// The design tokens, fonts and element defaults every Element Call stylesheet
// builds on. Written for a page, they speak of `html`, `body` and bare
// elements; the component build confines them, and every other stylesheet in
// this bundle, to the root element below (see build/scopeStylesToRoot.ts), so
// that the host's document is left as it was.
//
// Where these land relative to the component stylesheets is the bundler's
// choice — the standalone app puts them first, this build puts them in the
// middle — so nothing in base.css may depend on winning or losing against a
// component's own rules at equal specificity. It currently does not: what it
// declares unlayered is custom properties on Element Call's root, which
// components inherit rather than compete with, and everything from Compound
// sits in a `@layer`, which loses to unlayered rules either way.
import "../src/base.css";

import {
  type FC,
  type JSX,
  type ReactNode,
  type Ref,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { type MatrixClient } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { TooltipProvider } from "@vector-im/compound-web";
import { ErrorBoundary } from "@sentry/react";
import { shouldPolyfill as shouldPolyfillSegmenter } from "@formatjs/intl-segmenter/should-polyfill";
import { shouldPolyfill as shouldPolyfillDurationFormat } from "@formatjs/intl-durationformat/should-polyfill.js";

import EN from "../locales/en/app.json";
import { CallView } from "../src/room/CallView";
import { ErrorPage } from "../src/FullScreenView";
import { ClientProvider } from "../src/ClientContext";
import { HostBridgeProvider } from "../src/HostBridge";
import { RootElementProvider, useRootElement } from "../src/RootElementContext";
import {
  configurationForIntent,
  componentProperties,
  type UrlConfiguration,
  type UrlParams,
  UrlParamsProvider,
  type UrlProperties,
  UserIntent,
  useUrlParams,
} from "../src/UrlParams";
import { MediaDevicesContext } from "../src/MediaDevicesContext";
import { MediaDevices } from "../src/state/MediaDevices";
import { ObservableScope } from "../src/state/ObservableScope";
import { ProcessorProvider } from "../src/livekit/TrackProcessorContext";
import { Config } from "../src/config/Config";
import { type ConfigOptions } from "../src/config/ConfigOptions";
import { i18n } from "../src/utils/i18n";
import { useTheme } from "../src/useTheme";
import { useStableValue } from "../src/useStableValue";
import styles from "./ElementCall.module.css";
import {
  type ElementCallHandle,
  type ElementCallHostBridge,
  useComponentHostBridge,
} from "./host";

// How the host and Element Call talk to each other, and what they say
export { type ElementCallHandle, type ElementCallHostBridge } from "./host";
export {
  type DeviceMuteRequest,
  type DeviceMuteState,
} from "../src/HostBridge";
export { type JoinCallData } from "../src/widget";
// The deployment-wide configuration, as distinct from ElementCallConfiguration
// above, which is per call
export { type ConfigOptions } from "../src/config/ConfigOptions";
// The values that appear in ElementCallConfiguration and in the intent
export {
  BackgroundStyle,
  HeaderStyle,
  UserIntent,
  type UrlConfiguration,
} from "../src/UrlParams";

/**
 * How Element Call should behave. Everything is optional; anything left out
 * takes the default that {@link ElementCallProps.intent} implies.
 *
 * This is the behaviour a widget can be configured with through its URL, plus
 * the two facts about the call a host has a say in: the theme to start in and
 * the background. The rest of what a widget's URL carries — who the user is,
 * how to reach the homeserver, where to report analytics, the shared secret of
 * a room that is encrypted with one — a component host supplies by other
 * routes, or not at all.
 */
export type ElementCallConfiguration = Partial<UrlConfiguration> &
  Partial<Pick<UrlProperties, "theme" | "background">>;

export interface ElementCallProps {
  /**
   * The client to place the call with. Element Call does not authenticate
   * anyone or manage a session of its own; this one is the host's.
   */
  client: MatrixClient;
  /** The room to call in. The host's client must already know about it. */
  roomId: string;
  /**
   * What the user asked for — whether they started the call or joined one that
   * was already running, and whether it is a call in a group or a DM. Element
   * Call decides what each of those means: whether to show the lobby first,
   * whether to ring, and so on.
   *
   * Defaults to joining an existing group call, which is the most conservative
   * reading, but a host that knows which button the user pressed should say so.
   */
  intent?: UserIntent;
  /**
   * How Element Call should behave, overriding whatever {@link intent} implies.
   * A host that finds itself setting a lot of these probably wants a different
   * intent instead.
   *
   * Compared by value, so it is fine to write this inline; only a change to
   * what it says restarts anything.
   */
  config?: ElementCallConfiguration;
  /**
   * What Element Call tells the host while the call is running: that the user
   * has joined or hung up, that it would like to be kept on screen, and so on.
   * Without one, Element Call assumes nobody is listening.
   */
  hostBridge?: ElementCallHostBridge;
  /**
   * What the host tells Element Call: to change theme, to hang up, to mute.
   * Available once the component has rendered.
   */
  ref?: Ref<ElementCallHandle>;
}

/**
 * Prepares the things Element Call needs before it can be shown: translations,
 * `Intl` polyfills for older browsers, and its configuration.
 *
 * Await this once, before rendering {@link ElementCall}.
 */
export async function initializeElementCall(
  config: ConfigOptions = {},
): Promise<void> {
  const polyfills: Promise<unknown>[] = [];
  if (shouldPolyfillSegmenter())
    polyfills.push(import("@formatjs/intl-segmenter/polyfill-force"));
  if (shouldPolyfillDurationFormat())
    polyfills.push(import("@formatjs/intl-durationformat/polyfill-force.js"));
  await Promise.all(polyfills);

  Config.initWith(config);
  await i18n.init({
    fallbackLng: "en",
    defaultNS: "app",
    keySeparator: ".",
    nsSeparator: false,
    pluralSeparator: "_",
    contextSeparator: "|",
    lng: "en",
    interpolation: { escapeValue: false },
    // English only, bundled in. The standalone app fetches its locale files at
    // runtime from URLs its own build emits, which a host serving the library
    // from elsewhere could not resolve; bundling one language at least keeps
    // the component self-contained. Letting a host supply the rest, or its own
    // translations, is still to do.
    resources: { en: { app: EN } },
  });
}

/** Applies the theme and background to the container, before it is painted. */
const Decoration: FC<{ children: JSX.Element }> = ({ children }) => {
  useTheme();
  const { background } = useUrlParams();
  const rootElement = useRootElement();
  useLayoutEffect(() => {
    rootElement.setAttribute("data-background", background);
  }, [rootElement, background]);
  return children;
};

export const ElementCall: FC<ElementCallProps> = ({
  client,
  roomId,
  intent = UserIntent.JoinExistingCall,
  config,
  hostBridge: suppliedHostBridge,
  ref,
}): ReactNode => {
  const hostBridge = useComponentHostBridge(suppliedHostBridge, ref);

  // The container is what Element Call decorates and portals into, so nothing
  // inside can render until we have it.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  // Element Call has no URL of its own to read any of this from, and the
  // host's URL is not Element Call's business, so the defaults come from the
  // intent with the host's wishes over the top.
  //
  // Everything downstream — the mute state, the call view model and with it
  // the media connection — is keyed on the identity of this object, so it has
  // to be stable for as long as its contents are. A host writing `config`
  // inline would otherwise tear the call down on every render.
  const stableConfig = useStableValue(config);
  const params = useMemo(
    (): UrlParams => ({
      ...componentProperties,
      roomId,
      ...configurationForIntent(intent),
      ...stableConfig,
    }),
    [roomId, intent, stableConfig],
  );

  // Created in an effect so that the scope it lives in ends when the component
  // is unmounted (or these options change), rather than keeping its device
  // observers running for the rest of the page's life. Null until then, which
  // is one render.
  const { controlledAudioDevices, callIntent } = params;
  const [mediaDevices, setMediaDevices] = useState<MediaDevices | null>(null);
  useEffect(() => {
    const scope = new ObservableScope();
    setMediaDevices(
      new MediaDevices(scope, { controlledAudioDevices, callIntent }),
    );
    return (): void => {
      setMediaDevices(null);
      scope.end();
    };
  }, [controlledAudioDevices, callIntent]);

  const room = client.getRoom(roomId);
  const rtcSession = useMemo(
    () => (room === null ? null : client.matrixRTC.getRoomSession(room)),
    [client, room],
  );

  if (rtcSession === null)
    logger.error(
      `Element Call was asked to call in ${roomId}, which its host's client does not know about`,
    );

  return (
    <I18nextProvider i18n={i18n}>
      <HostBridgeProvider value={hostBridge}>
        <UrlParamsProvider value={params}>
          {/* Element Call's own navigation stays in memory, so that the
          component cannot disturb the host's URL. */}
          <MemoryRouter>
            <div ref={setContainer} className={styles.root}>
              {container !== null &&
                rtcSession !== null &&
                mediaDevices !== null && (
                  <RootElementProvider value={container}>
                    {/* Whatever goes wrong in here is shown in here. Left to
                    propagate, an error would unmount the host's own tree. */}
                    <ErrorBoundary
                      fallback={(error) => <ErrorPage error={error} />}
                      // A broken call should not hold the host on screen
                      onError={() => void hostBridge.setAlwaysOnScreen(false)}
                    >
                      <Decoration>
                        <TooltipProvider>
                          <ClientProvider client={client}>
                            <MediaDevicesContext value={mediaDevices}>
                              <ProcessorProvider>
                                <CallView
                                  client={client}
                                  rtcSession={rtcSession}
                                  isPasswordlessUser={false}
                                  confineToRoom={params.confineToRoom}
                                  preload={params.preload}
                                  skipLobby={params.skipLobby}
                                />
                              </ProcessorProvider>
                            </MediaDevicesContext>
                          </ClientProvider>
                        </TooltipProvider>
                      </Decoration>
                    </ErrorBoundary>
                  </RootElementProvider>
                )}
            </div>
          </MemoryRouter>
        </UrlParamsProvider>
      </HostBridgeProvider>
    </I18nextProvider>
  );
};
