/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * How a host application and the Element Call component talk to each other.
 *
 * Inside Element Call the host is a {@link HostBridge}, which carries the
 * host's requests as rxjs observables because that is what the widget API and
 * the view models work in. A host should not have to know about rxjs, or agree
 * with us on a version of it, so a component host sees neither: it implements
 * plain async callbacks for what Element Call tells it, and makes its own
 * requests through an imperative handle on the component, the way it would
 * call `play()` on a video element. This module adapts the one to the other.
 */

import { type Ref, useEffect, useImperativeHandle } from "react";
import { ReplaySubject, Subject } from "rxjs";

import {
  type DeviceMuteRequest,
  type DeviceMuteState,
  type HostBridge,
  type HostRequest,
} from "../src/HostBridge";
import { type JoinCallData } from "../src/widget";
import { useInitial } from "../src/useInitial";
import { useLatest } from "../src/useLatest";

/**
 * What Element Call tells the application hosting it as a component.
 * Everything is optional: a host implements what it wants to hear about.
 *
 * Compared by nothing — Element Call always calls whichever one it was most
 * recently given, so this may be written inline.
 */
export interface ElementCallHostBridge {
  /**
   * Asks the host to keep Element Call on screen (or stop doing so), so that a
   * call in progress is not torn down when the user navigates elsewhere.
   */
  setAlwaysOnScreen?(alwaysOnScreen: boolean): Promise<void>;
  /** Tells the host that Element Call has finished loading. */
  contentLoaded?(): Promise<void>;
  /** Tells the host that the user has joined the call. */
  notifyJoined?(): Promise<void>;
  /** Tells the host that the user has hung up. */
  notifyHungUp?(): Promise<void>;
  /** Tells the host the user's current audio and video mute state. */
  notifyDeviceMute?(state: DeviceMuteState): Promise<void>;
  /**
   * Asks the host to close Element Call: to unmount the component. Its
   * presence is what makes Element Call offer a close button on its error
   * screens, and leave the host to decide what is shown once a call has ended.
   * Without it, Element Call shows its own post-call screen, if it has one for
   * the situation, or nothing.
   */
  close?(): Promise<void>;
  /**
   * Whether Element Call may send and receive reactions in this room.
   * Defaults to true.
   */
  readonly supportsReactions?: boolean;
  /**
   * Fetches media on Element Call's behalf, for hosts that do not want it
   * touching the homeserver's media endpoints itself. Absent, Element Call
   * fetches media with the client it was given.
   */
  downloadMedia?(mxcUri: string): Promise<Blob>;
}

/**
 * What a host can ask of a mounted Element Call, reached through the
 * component's `ref`. Each request resolves once Element Call has acted on it,
 * and rejects if nothing in Element Call is in a position to act: hanging up
 * when there is no call, say.
 */
export interface ElementCallHandle {
  /**
   * Joins the call, when Element Call was configured to `preload` and is
   * waiting to be told to. Says which devices to join with.
   */
  join(devices: JoinCallData): Promise<void>;
  /** Leaves the call. */
  hangUp(): Promise<void>;
  /**
   * Changes the mute state, for whichever of audio and video is given, and
   * reports the state that results.
   */
  setDeviceMute(request: DeviceMuteRequest): Promise<DeviceMuteState>;
}

/** Hands a request to Element Call and waits for it to be acknowledged. */
async function request<Data, Reply>(
  listeners: Subject<HostRequest<Data, Reply>>,
  what: string,
  data: Data,
): Promise<Reply> {
  if (!listeners.observed)
    throw new Error(`Nothing in Element Call can ${what} right now`);
  return await new Promise((resolve) =>
    listeners.next({ data, reply: resolve }),
  );
}

/**
 * The {@link HostBridge} the rest of Element Call sees, built from what a
 * component host supplies and wired to the handle it is given.
 *
 * The bridge is created once and never changes identity — everything that
 * depends on it would otherwise restart when the host re-rendered with a new
 * object — and forwards each call to whatever the host most recently passed.
 */
export function useComponentHostBridge(
  supplied: ElementCallHostBridge | undefined,
  ref: Ref<ElementCallHandle> | undefined,
  /** The theme the host wants, or undefined to leave it to Element Call. */
  theme: string | undefined,
): HostBridge {
  const latest = useLatest(supplied ?? {});

  const requests = useInitial(() => ({
    // The theme is state, not an event: a `theme` prop rather than a request
    // on the handle. It travels this channel because that is how the rest of
    // Element Call hears about a host's theme, and replays so that whatever
    // subscribes after the host has set it — everything, on first render —
    // still hears the current one.
    themeChange$: new ReplaySubject<HostRequest<{ name?: string }>>(1),
    join$: new Subject<HostRequest<JoinCallData>>(),
    hangUp$: new Subject<HostRequest<Record<string, never>>>(),
    deviceMute$: new Subject<HostRequest<DeviceMuteRequest, DeviceMuteState>>(),
  }));

  useEffect(() => {
    if (theme !== undefined)
      requests.themeChange$.next({ data: { name: theme }, reply: () => {} });
  }, [requests, theme]);

  const bridge = useInitial(
    (): HostBridge => ({
      setAlwaysOnScreen: async (alwaysOnScreen) => {
        await latest.current.setAlwaysOnScreen?.(alwaysOnScreen);
      },
      contentLoaded: async () => {
        await latest.current.contentLoaded?.();
      },
      notifyJoined: async () => {
        await latest.current.notifyJoined?.();
      },
      notifyHungUp: async () => {
        await latest.current.notifyHungUp?.();
      },
      notifyDeviceMute: async (state) => {
        await latest.current.notifyDeviceMute?.(state);
      },
      // Whether these exist is itself information, so they are read through
      // rather than wrapped unconditionally
      get close() {
        const close = latest.current.close;
        return close === undefined
          ? undefined
          : async (): Promise<void> => await close();
      },
      get downloadMedia() {
        const downloadMedia = latest.current.downloadMedia;
        return downloadMedia === undefined
          ? undefined
          : async (mxcUri: string): Promise<Blob> =>
              await downloadMedia(mxcUri);
      },
      get supportsReactions(): boolean {
        return latest.current.supportsReactions ?? true;
      },
      // Whatever the host says or does not say, the account is its own: it
      // signed the user in and handed us the client. So Element Call never
      // offers to edit the profile from inside a component.
      supportsProfileChanges: false,
      ...requests,
    }),
  );

  useImperativeHandle(
    ref,
    (): ElementCallHandle => ({
      join: async (devices) =>
        await request(requests.join$, "join a call", devices),
      hangUp: async () => await request(requests.hangUp$, "hang up", {}),
      setDeviceMute: async (muteRequest) =>
        await request(
          requests.deviceMute$,
          "change the mute state",
          muteRequest,
        ),
    }),
    [requests],
  );

  return bridge;
}
