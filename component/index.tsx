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

import { type FC, type JSX, type ReactNode, useMemo, useState } from "react";
import { type MatrixClient } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { TooltipProvider } from "@vector-im/compound-web";
import { shouldPolyfill as shouldPolyfillSegmenter } from "@formatjs/intl-segmenter/should-polyfill";
import { shouldPolyfill as shouldPolyfillDurationFormat } from "@formatjs/intl-durationformat/should-polyfill.js";

import EN from "../locales/en/app.json";
import { ElementCallView } from "../src/ElementCallView";
import { ClientProvider } from "../src/ClientContext";
import {
  type HostBridge,
  HostBridgeProvider,
  nullHostBridge,
} from "../src/HostBridge";
import { RootElementProvider } from "../src/RootElementContext";
import {
  configurationForIntent,
  hostedProperties,
  type UrlParams,
  UrlParamsProvider,
  UserIntent,
} from "../src/UrlParams";
import { MediaDevicesContext } from "../src/MediaDevicesContext";
import { MediaDevices } from "../src/state/MediaDevices";
import { ObservableScope } from "../src/state/ObservableScope";
import { ProcessorProvider } from "../src/livekit/TrackProcessorContext";
import { Config } from "../src/config/Config";
import { type ConfigOptions } from "../src/config/ConfigOptions";
import { i18n } from "../src/utils/i18n";
import { useTheme } from "../src/useTheme";
import { useInitial } from "../src/useInitial";
import styles from "./ElementCall.module.css";

// Everything needed to implement a HostBridge, not just the interface itself
export {
  type DeviceMuteRequest,
  type DeviceMuteState,
  type HostBridge,
  type HostRequest,
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
 */
export type ElementCallConfiguration = Partial<UrlParams>;

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
   */
  config?: ElementCallConfiguration;
  /**
   * How to reach the host while the call is running — to be told the user has
   * joined or hung up, to be asked to keep the call on screen, and so on.
   * Without one, Element Call assumes it has no host to talk to.
   */
  hostBridge?: HostBridge;
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

/** Applies the theme to the container, before it is painted. */
const Decoration: FC<{ children: JSX.Element }> = ({ children }) => {
  useTheme();
  return children;
};

export const ElementCall: FC<ElementCallProps> = ({
  client,
  roomId,
  intent = UserIntent.JoinExistingCall,
  config,
  hostBridge = nullHostBridge,
}): ReactNode => {
  // The container is what Element Call decorates and portals into, so nothing
  // inside can render until we have it.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  // Element Call has no URL of its own to read any of this from, and the
  // host's URL is not Element Call's business, so the defaults come from the
  // intent with the host's wishes over the top.
  const params = useMemo(
    (): UrlParams => ({
      ...hostedProperties,
      roomId,
      ...configurationForIntent(intent),
      ...config,
    }),
    [roomId, intent, config],
  );

  const mediaDevices = useInitial(
    () =>
      new MediaDevices(new ObservableScope(), {
        controlledAudioDevices: params.controlledAudioDevices,
        callIntent: params.callIntent,
      }),
  );

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
          {/* Element Call's own navigation stays in memory, so that being
          embedded cannot disturb the host's URL. */}
          <MemoryRouter>
            <div ref={setContainer} className={styles.root}>
              {container !== null && rtcSession !== null && (
                <RootElementProvider value={container}>
                  <Decoration>
                    <TooltipProvider>
                      <ClientProvider client={client}>
                        <MediaDevicesContext value={mediaDevices}>
                          <ProcessorProvider>
                            <ElementCallView
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
                </RootElementProvider>
              )}
            </div>
          </MemoryRouter>
        </UrlParamsProvider>
      </HostBridgeProvider>
    </I18nextProvider>
  );
};
