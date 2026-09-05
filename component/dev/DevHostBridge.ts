/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { NEVER, Subject } from "rxjs";

import {
  type DeviceMuteRequest,
  type DeviceMuteState,
  type HostBridge,
  type HostRequest,
} from "../index";

/**
 * A host bridge that reports everything it is told and can be driven by hand,
 * so that the harness can watch both directions of the conversation between
 * Element Call and its host.
 */
export interface DevHostBridge extends HostBridge {
  /** Tells Element Call the host has changed theme. */
  requestTheme(name: string): void;
  /** Tells Element Call to leave the call. */
  requestHangUp(): void;
  /** Asks Element Call to change, and report back, its mute state. */
  requestDeviceMute(request: DeviceMuteRequest): void;
}

export function createDevHostBridge(
  log: (message: string) => void,
  /** What the host does when Element Call asks to be closed. */
  onClose: () => void,
): DevHostBridge {
  const themeChange$ = new Subject<HostRequest<{ name?: string }>>();
  const hangUp$ = new Subject<HostRequest<Record<string, never>>>();
  const deviceMute$ = new Subject<
    HostRequest<DeviceMuteRequest, DeviceMuteState>
  >();

  const ask = <Data, Reply>(
    subject: Subject<HostRequest<Data, Reply>>,
    name: string,
    data: Data,
  ): void => {
    // Worth saying out loud: a request nobody is subscribed to is silently
    // dropped, and that is exactly the sort of thing the harness is for.
    if (!subject.observed) {
      log(`← ${name}: nothing is listening`);
      return;
    }
    log(`← ${name}`);
    subject.next({
      data,
      reply: (reply): void =>
        log(
          `→ ${name} acknowledged${reply === undefined ? "" : `: ${JSON.stringify(reply)}`}`,
        ),
    });
  };

  /**
   * Records something Element Call told the host. Nothing is sent anywhere, so
   * this is only asynchronous because a real host's answer would have to be.
   */
  const told = async (message: string): Promise<void> => {
    log(`→ ${message}`);
    await Promise.resolve();
  };

  return {
    setAlwaysOnScreen: async (alwaysOnScreen): Promise<void> =>
      await told(`setAlwaysOnScreen(${alwaysOnScreen})`),
    contentLoaded: async (): Promise<void> => await told("contentLoaded"),
    notifyJoined: async (): Promise<void> => await told("notifyJoined"),
    notifyHungUp: async (): Promise<void> => await told("notifyHungUp"),
    notifyDeviceMute: async (state): Promise<void> =>
      await told(
        `notifyDeviceMute(audio: ${state.audio_enabled}, video: ${state.video_enabled})`,
      ),
    // Present because this host really can dismiss Element Call, which is what
    // makes it offer a close affordance at all
    close: async (): Promise<void> => {
      await told("close");
      onClose();
    },

    themeChange$,
    // The harness does not preload a call, so this is never asked for
    join$: NEVER,
    hangUp$,
    deviceMute$,

    supportsReactions: true,

    requestTheme: (name): void =>
      ask(themeChange$, `themeChange(${name})`, { name }),
    requestHangUp: (): void => ask(hangUp$, "hangUp", {}),
    requestDeviceMute: (request): void =>
      ask(deviceMute$, `deviceMute(${JSON.stringify(request)})`, request),
  };
}
