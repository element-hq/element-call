/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * EXPERIMENTAL
 *
 * What a host needs in order to talk about Element Call, without Element Call:
 * the component's props and the types they are made of, the handle and the
 * host bridge, the intents a call can be started with and the configuration
 * each implies.
 *
 * This is an entry point of its own, `@element-hq/element-call-component/api`,
 * so that a host can import it on a path that must stay light — a call model
 * that needs `BackgroundStyle.Solid` as a value, say — and load the component
 * itself, and everything it brings, only when a call is shown. The main entry
 * point re-exports all of it, so a host that does not care may import
 * everything from there.
 *
 * Nothing in here may reach anything that is not a type or a constant: the
 * point of this module is what it does not import.
 */

import type { Ref } from "react";
import type { MatrixClient } from "matrix-js-sdk";

import type { UrlProperties } from "../src/UrlParams";
import type { ElementCallHandle, ElementCallHostBridge } from "./host";
import {
  BackgroundStyle,
  configurationForIntent,
  HeaderStyle,
  type UrlConfiguration,
  UserIntent,
} from "../src/UrlConfiguration";

// How the host and Element Call talk to each other, and what they say
export type { ElementCallHandle, ElementCallHostBridge } from "./host";
export type { DeviceMuteRequest, DeviceMuteState } from "../src/HostBridge";
export type { JoinCallData } from "../src/widget";
// The deployment-wide configuration, as distinct from ElementCallConfiguration
// below, which is per call
export type { ConfigOptions } from "../src/config/ConfigOptions";
// The values that appear in ElementCallConfiguration and in the intent, and
// what each intent means by default
export {
  BackgroundStyle,
  configurationForIntent,
  HeaderStyle,
  type UrlConfiguration,
  UserIntent,
};

/**
 * How Element Call should behave. Everything is optional; anything left out
 * takes the default that {@link ElementCallProps.intent} implies.
 *
 * This is the behaviour a widget can be configured with through its URL, plus
 * the one fact about the call a host has a say in here, the background. The
 * rest of what a widget's URL carries — who the user is, how to reach the
 * homeserver, where to report analytics, the shared secret of a room that is
 * encrypted with one — a component host supplies by other routes, or not at
 * all; and what can change while the call is running, the theme and the
 * language, is a prop of its own.
 */
export type ElementCallConfiguration = Partial<UrlConfiguration> &
  Partial<Pick<UrlProperties, "background">>;

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
   * What the host tells Element Call: to hang up, to mute, to join. Available
   * once the component has rendered.
   */
  ref?: Ref<ElementCallHandle>;
  /**
   * The theme to show Element Call in, `light` or `dark`. Left out, Element
   * Call picks. Changes take effect at once, and cost nothing else.
   */
  theme?: string;
  /**
   * The language to show Element Call in, as a BCP 47 tag: one of the
   * `supportedLanguages` the main entry point exports, or something that falls
   * back to one (`de-AT` to `de`). Left out, the browser's language is used.
   *
   * Translations are one thing shared by every Element Call on the page, so
   * the most recently set language wins for all of them.
   */
  language?: string;
}
