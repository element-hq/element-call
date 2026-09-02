/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContext, use } from "react";
import { fromEvent, map, NEVER, type Observable } from "rxjs";
import {
  type IWidgetApiRequest,
  type IWidgetApiRequestData,
  WidgetApiToWidgetAction,
} from "matrix-widget-api";

import {
  ElementWidgetActions,
  type JoinCallData,
  type WidgetHelpers,
} from "./widget";

// Note: these are type aliases rather than interfaces so that they satisfy the
// widget API's index-signature payload types.

/** The mute state Element Call and its host exchange. */
export type DeviceMuteState = {
  audio_enabled: boolean;
  video_enabled: boolean;
};

/**
 * A mute state change requested by the host. An absent field means "leave this
 * one as it is".
 */
export type DeviceMuteRequest = {
  audio_enabled?: boolean;
  video_enabled?: boolean;
};

/**
 * Something the host has asked of Element Call, which it is expected to
 * acknowledge.
 */
export interface HostRequest<Data, Reply = void> {
  data: Data;
  /** Acknowledges the request. Should be called exactly once. */
  reply(reply: Reply): void;
}

/**
 * Element Call's view of the application hosting it.
 *
 * Element Call can run as its own page, as a widget inside a Matrix client, or
 * embedded directly into one. Only the last two give it a host, and each of
 * them reaches it by a different route — so everything Element Call needs from
 * whatever is hosting it goes through this interface, rather than being
 * expressed in terms of the widget API.
 *
 * This covers the interactions Element Call has with its host while running.
 * The Matrix client it talks to is supplied separately, at startup.
 */
export interface HostBridge {
  // What Element Call tells the host.

  /**
   * Asks the host to keep Element Call on screen (or stop doing so), so that a
   * call in progress is not torn down when the user navigates elsewhere.
   */
  setAlwaysOnScreen(alwaysOnScreen: boolean): Promise<void>;
  /** Tells the host that Element Call has finished loading. */
  contentLoaded(): Promise<void>;
  /** Tells the host that the user has joined the call. */
  notifyJoined(): Promise<void>;
  /** Tells the host that the user has hung up. */
  notifyHungUp(): Promise<void>;
  /** Tells the host the user's current audio and video mute state. */
  notifyDeviceMute(state: DeviceMuteState): Promise<void>;
  /**
   * Asks the host to close Element Call, and stops communicating with it. No
   * further calls should be made on this bridge afterwards.
   *
   * Absent when the host has no way to dismiss Element Call — standalone, the
   * user navigates away instead — so its presence is what tells the interface
   * whether to offer a close affordance.
   */
  close?(): Promise<void>;

  // What the host asks of Element Call.

  /** The host has changed the theme Element Call should use. */
  themeChange$: Observable<HostRequest<{ name?: string }>>;
  /** The host wants a preloaded Element Call to join the call now. */
  join$: Observable<HostRequest<JoinCallData>>;
  /** The host wants Element Call to leave the call. */
  hangUp$: Observable<HostRequest<Record<string, never>>>;
  /** The host wants to change, or read back, the device mute state. */
  deviceMute$: Observable<HostRequest<DeviceMuteRequest, DeviceMuteState>>;

  // What the host is capable of.

  /** Whether the host permits Element Call to send and receive reactions. */
  readonly supportsReactions: boolean;
  /**
   * Fetches media on Element Call's behalf, for hosts that do not give it
   * direct access to the homeserver. Absent when Element Call should fetch
   * media itself using its own client.
   */
  downloadMedia?(mxcUri: string): Promise<Blob>;
}

/**
 * A bridge to nowhere, for when Element Call has no host — that is, when it is
 * running as its own page and talks to the homeserver directly.
 */
export const nullHostBridge: HostBridge = {
  setAlwaysOnScreen: async () => {},
  contentLoaded: async () => {},
  notifyJoined: async () => {},
  notifyHungUp: async () => {},
  notifyDeviceMute: async () => {},
  themeChange$: NEVER,
  join$: NEVER,
  hangUp$: NEVER,
  deviceMute$: NEVER,
  // Standalone Element Call reaches the homeserver itself, so nothing is
  // withholding these from it.
  supportsReactions: true,
};

/** Bridges to a host that Element Call is a widget of. */
export function createWidgetHostBridge(widget: WidgetHelpers): HostBridge {
  const requests = <Data, Reply>(
    action: string,
  ): Observable<HostRequest<Data, Reply>> =>
    (
      fromEvent(widget.lazyActions, action) as Observable<
        CustomEvent<IWidgetApiRequest>
      >
    ).pipe(
      map((ev) => ({
        data: ev.detail.data as Data,
        // The widget API requires a reply for every request, and carries the
        // payload as a plain object, so an empty reply becomes {}.
        reply: (reply: Reply): void =>
          widget.api.transport.reply(ev.detail, reply ?? {}),
      })),
    );

  const send = async (
    action: ElementWidgetActions,
    data: IWidgetApiRequestData = {},
  ): Promise<void> => {
    await widget.api.transport.send(action, data);
  };

  return {
    setAlwaysOnScreen: async (alwaysOnScreen) => {
      await widget.api.setAlwaysOnScreen(alwaysOnScreen);
    },
    contentLoaded: async () => widget.api.sendContentLoaded(),
    notifyJoined: async () => send(ElementWidgetActions.JoinCall),
    notifyHungUp: async () => send(ElementWidgetActions.HangupCall),
    notifyDeviceMute: async (state) =>
      send(ElementWidgetActions.DeviceMute, state),
    close: async () => {
      await send(ElementWidgetActions.Close);
      widget.api.transport.stop();
    },
    themeChange$: requests(WidgetApiToWidgetAction.ThemeChange),
    join$: requests(ElementWidgetActions.JoinCall),
    hangUp$: requests(ElementWidgetActions.HangupCall),
    deviceMute$: requests(ElementWidgetActions.DeviceMute),
    // Element Call needs the host's permission to send reactions on its behalf.
    // Read on access rather than up front: the widget API negotiates its
    // capabilities asynchronously, and the bridge is built before that settles.
    get supportsReactions(): boolean {
      return (
        widget.api.hasCapability("org.matrix.msc2762.send.event:m.reaction") &&
        widget.api.hasCapability(
          "org.matrix.msc2762.send.event:m.room.redaction",
        ) &&
        widget.api.hasCapability(
          "org.matrix.msc2762.receive.event:m.reaction",
        ) &&
        widget.api.hasCapability(
          "org.matrix.msc2762.receive.event:m.room.redaction",
        )
      );
    },
    downloadMedia: async (mxcUri) => {
      const { file } = await widget.api.downloadFile(mxcUri);
      if (file instanceof Blob) return file;
      if (typeof file === "string")
        // it is a base64 string
        return new Blob([Uint8Array.from(atob(file), (c) => c.charCodeAt(0))]);
      throw new Error(
        `Downloaded file format is not supported: ${typeof file}`,
      );
    },
  };
}

const HostBridgeContext = createContext<HostBridge | null>(null);

export const HostBridgeProvider = HostBridgeContext.Provider;

/**
 * The application hosting Element Call.
 *
 * Defaults to {@link nullHostBridge}, so that tests and stories, which have no
 * host, need no provider.
 */
export const useHostBridge = (): HostBridge =>
  use(HostBridgeContext) ?? nullHostBridge;
