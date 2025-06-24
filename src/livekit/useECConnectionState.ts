/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ConnectionError,
  ConnectionState,
  type LocalTrack,
  type Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "matrix-js-sdk/lib/logger";
import * as Sentry from "@sentry/react";

import { type SFUConfig, sfuConfigEquals } from "./openIDSFU";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import {
  ElementCallError,
  InsufficientCapacityError,
  UnknownCallError,
} from "../utils/errors.ts";
import { AbortHandle } from "../utils/abortHandle.ts";

declare global {
  interface Window {
    peerConnectionTimeout?: number;
    websocketTimeout?: number;
  }
}

/*
 * Additional values for states that a call can be in, beyond what livekit
 * provides in ConnectionState. Also reconnects the call if the SFU Config
 * changes.
 */
export enum ECAddonConnectionState {
  // We are switching from one focus to another (or between livekit room aliases on the same focus)
  ECSwitchingFocus = "ec_switching_focus",
  // The call has just been initialised and is waiting for credentials to arrive before attempting
  // to connect. This distinguishes from the 'Disconnected' state which is now just for when livekit
  // gives up on connectivity and we consider the call to have failed.
  ECWaiting = "ec_waiting",
}

export type ECConnectionState = ConnectionState | ECAddonConnectionState;

// This is mostly necessary because an empty useRef is an empty object
// which is truthy, so we can't just use Boolean(currentSFUConfig.current)
function sfuConfigValid(sfuConfig?: SFUConfig): boolean {
  return Boolean(sfuConfig?.url) && Boolean(sfuConfig?.jwt);
}

async function doConnect(
  livekitRoom: Room,
  sfuConfig: SFUConfig,
  audioEnabled: boolean,
  initialDeviceId: string | undefined,
  abortHandle: AbortHandle,
): Promise<void> {
  // Always create an audio track manually.
  // livekit (by default) keeps the mic track open when you mute, but if you start muted,
  // doesn't publish it until you unmute. We want to publish it from the start so we're
  // always capturing audio: it helps keep bluetooth headsets in the right mode and
  // mobile browsers to know we're doing a call.
  if (
    livekitRoom!.localParticipant.getTrackPublication(Track.Source.Microphone)
  ) {
    logger.warn(
      "Pre-creating audio track but participant already appears to have an microphone track: this shouldn't happen!",
    );
    Sentry.captureMessage(
      "Pre-creating audio track but participant already appears to have an microphone track!",
    );
    return;
  }

  logger.info("Pre-creating microphone track");
  let preCreatedAudioTrack: LocalTrack | undefined;
  try {
    const audioTracks = await livekitRoom!.localParticipant.createTracks({
      audio: { deviceId: initialDeviceId },
    });

    if (audioTracks.length < 1) {
      logger.info("Tried to pre-create local audio track but got no tracks");
    } else {
      preCreatedAudioTrack = audioTracks[0];
    }
    // There was a yield point previously (awaiting for the track to be created) so we need to check
    // if the operation was cancelled and stop connecting if needed.
    if (abortHandle.isAborted()) {
      logger.info(
        "[Lifecycle] Signal Aborted: Pre-created audio track but connection aborted",
      );
      preCreatedAudioTrack?.stop();
      return;
    }

    logger.info("Pre-created microphone track");
  } catch (e) {
    logger.error("Failed to pre-create microphone track", e);
  }

  if (!audioEnabled) {
    await preCreatedAudioTrack?.mute();
    // There was a yield point. Check if the operation was cancelled and stop connecting.
    if (abortHandle.isAborted()) {
      logger.info(
        "[Lifecycle] Signal Aborted: Pre-created audio track but connection aborted",
      );
      preCreatedAudioTrack?.stop();
      return;
    }
  }

  // check again having awaited for the track to create
  if (
    livekitRoom!.localParticipant.getTrackPublication(Track.Source.Microphone)
  ) {
    logger.warn(
      "Pre-created audio track but participant already appears to have an microphone track: this shouldn't happen!",
    );
    preCreatedAudioTrack?.stop();
    return;
  }

  logger.info("[Lifecycle] Connecting & publishing");
  try {
    await connectAndPublish(livekitRoom, sfuConfig, preCreatedAudioTrack, []);
    if (abortHandle.isAborted()) {
      logger.info(
        "[Lifecycle] Signal Aborted: Connected but operation was cancelled. Force disconnect",
      );
      livekitRoom?.disconnect().catch((err) => {
        logger.error("Failed to disconnect from SFU", err);
      });
      return;
    }
  } catch (e) {
    preCreatedAudioTrack?.stop();
    logger.debug("Stopped precreated audio tracks.");
    throw e;
  }
}

/**
 * Connect to the SFU and publish specific tracks, if provided.
 * This is very specific to what we need to do: for instance, we don't
 * currently have a need to prepublish video tracks. We just prepublish
 * a mic track at the start of a call and copy any srceenshare tracks over
 * when switching focus (because we can't re-acquire them without the user
 * going through the dialog to choose them again).
 */
async function connectAndPublish(
  livekitRoom: Room,
  sfuConfig: SFUConfig,
  micTrack: LocalTrack | undefined,
  screenshareTracks: MediaStreamTrack[],
): Promise<void> {
  const tracker = PosthogAnalytics.instance.eventCallConnectDuration;
  // Track call connect duration
  tracker.cacheConnectStart();
  livekitRoom.once(RoomEvent.SignalConnected, tracker.cacheWsConnect);

  try {
    logger.info(`[Lifecycle] Connecting to livekit room ${sfuConfig!.url} ...`);
    await livekitRoom!.connect(sfuConfig!.url, sfuConfig!.jwt, {
      // Due to stability issues on Firefox we are testing the effect of different
      // timeouts, and allow these values to be set through the console
      peerConnectionTimeout: window.peerConnectionTimeout ?? 45000,
      websocketTimeout: window.websocketTimeout ?? 45000,
    });
    logger.info(`[Lifecycle] ... connected to livekit room`);
  } catch (e) {
    logger.error("[Lifecycle] Failed to connect", e);
    // LiveKit uses 503 to indicate that the server has hit its track limits.
    // https://github.com/livekit/livekit/blob/fcb05e97c5a31812ecf0ca6f7efa57c485cea9fb/pkg/service/rtcservice.go#L171
    // It also errors with a status code of 200 (yes, really) for room
    // participant limits.
    // LiveKit Cloud uses 429 for connection limits.
    // Either way, all these errors can be explained as "insufficient capacity".
    if (
      e instanceof ConnectionError &&
      (e.status === 503 || e.status === 200 || e.status === 429)
    )
      throw new InsufficientCapacityError();
    throw e;
  }

  // remove listener in case the connect promise rejects before `SignalConnected` is emitted.
  livekitRoom.off(RoomEvent.SignalConnected, tracker.cacheWsConnect);
  tracker.track({ log: true });

  if (micTrack) {
    logger.info(`Publishing precreated mic track`);
    await livekitRoom.localParticipant.publishTrack(micTrack, {
      source: Track.Source.Microphone,
    });
  }

  logger.info(
    `Publishing ${screenshareTracks.length} precreated screenshare tracks`,
  );
  for (const st of screenshareTracks) {
    livekitRoom.localParticipant
      .publishTrack(st, {
        source: Track.Source.ScreenShare,
      })
      .catch((e) => {
        logger.error("Failed to publish screenshare track", e);
      });
  }
}

export function useECConnectionState(
  initialDeviceId: string | undefined,
  initialAudioEnabled: boolean,
  livekitRoom?: Room,
  sfuConfig?: SFUConfig,
): ECConnectionState {
  const [connState, setConnState] = useState(
    sfuConfig && livekitRoom
      ? livekitRoom.state
      : ECAddonConnectionState.ECWaiting,
  );

  const [isSwitchingFocus, setSwitchingFocus] = useState(false);
  const [isInDoConnect, setIsInDoConnect] = useState(false);
  const [error, setError] = useState<ElementCallError | null>(null);
  if (error !== null) throw error;

  const onConnStateChanged = useCallback((state: ConnectionState) => {
    if (state == ConnectionState.Connected) setSwitchingFocus(false);
    setConnState(state);
  }, []);

  useEffect(() => {
    const oldRoom = livekitRoom;

    if (livekitRoom) {
      livekitRoom.on(RoomEvent.ConnectionStateChanged, onConnStateChanged);
    }

    return (): void => {
      if (oldRoom)
        oldRoom.off(RoomEvent.ConnectionStateChanged, onConnStateChanged);
    };
  }, [livekitRoom, onConnStateChanged]);

  const doFocusSwitch = useCallback(async (): Promise<void> => {
    const screenshareTracks: MediaStreamTrack[] = [];
    for (const t of livekitRoom!.localParticipant.videoTrackPublications.values()) {
      if (t.track && t.source == Track.Source.ScreenShare) {
        const newTrack = t.track.mediaStreamTrack.clone();
        newTrack.enabled = true;
        screenshareTracks.push(newTrack);
      }
    }

    // Flag that we're currently switching focus. This will get reset when the
    // connection state changes back to connected in onConnStateChanged above.
    setSwitchingFocus(true);
    await livekitRoom?.disconnect();
    setIsInDoConnect(true);
    try {
      await connectAndPublish(
        livekitRoom!,
        sfuConfig!,
        undefined,
        screenshareTracks,
      );
    } finally {
      setIsInDoConnect(false);
    }
  }, [livekitRoom, sfuConfig]);

  const currentSFUConfig = useRef(Object.assign({}, sfuConfig));

  // Protection against potential leaks, where the component to be unmounted and there is
  // still a pending doConnect promise. This would lead the user to still be in the call even
  // if the component is unmounted.
  const abortHandlesBag = useRef(new Set<AbortHandle>());

  // This is a cleanup function that will be called when the component is about to be unmounted.
  // It will cancel all abortHandles in the bag
  useEffect(() => {
    const bag = abortHandlesBag.current;
    return (): void => {
      bag.forEach((handle) => {
        handle.abort();
      });
    };
  }, []);

  // Id we are transitioning from a valid config to another valid one, we need
  // to explicitly switch focus
  useEffect(() => {
    if (
      sfuConfigValid(sfuConfig) &&
      sfuConfigValid(currentSFUConfig.current) &&
      !sfuConfigEquals(currentSFUConfig.current, sfuConfig)
    ) {
      logger.info(
        `SFU config changed! URL was ${currentSFUConfig.current?.url} now ${sfuConfig?.url}`,
      );

      doFocusSwitch().catch((e) => {
        logger.error("Failed to switch focus", e);
      });
    } else if (
      !sfuConfigValid(currentSFUConfig.current) &&
      sfuConfigValid(sfuConfig)
    ) {
      // if we're transitioning from an invalid config to a valid one (ie. connecting)
      // then do an initial connection, including publishing the microphone track:
      // livekit (by default) keeps the mic track open when you mute, but if you start muted,
      // doesn't publish it until you unmute. We want to publish it from the start so we're
      // always capturing audio: it helps keep bluetooth headsets in the right mode and
      // mobile browsers to know we're doing a call.
      setIsInDoConnect(true);
      const abortHandle = new AbortHandle();
      abortHandlesBag.current.add(abortHandle);
      doConnect(
        livekitRoom!,
        sfuConfig!,
        initialAudioEnabled,
        initialDeviceId,
        abortHandle,
      )
        .catch((e) => {
          if (e instanceof ElementCallError) {
            setError(e); // Bubble up any error screens to React
          } else if (e instanceof Error) {
            setError(new UnknownCallError(e));
          } else logger.error("Failed to connect to SFU", e);
        })
        .finally(() => {
          abortHandlesBag.current.delete(abortHandle);
          setIsInDoConnect(false);
        });
    }

    currentSFUConfig.current = Object.assign({}, sfuConfig);
  }, [
    sfuConfig,
    livekitRoom,
    initialDeviceId,
    initialAudioEnabled,
    doFocusSwitch,
  ]);

  // Because we create audio tracks by hand, there's more to connecting than
  // just what LiveKit does in room.connect, and we should continue to return
  // ConnectionState.Connecting for the entire duration of the doConnect promise
  return isSwitchingFocus
    ? ECAddonConnectionState.ECSwitchingFocus
    : isInDoConnect
      ? ConnectionState.Connecting
      : connState;
}
