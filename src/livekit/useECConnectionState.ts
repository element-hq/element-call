/*
Copyright 2023 New Vector Ltd

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

import {
  AudioCaptureOptions,
  ConnectionState,
  LocalTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";
import * as Sentry from "@sentry/react";

import { SFUConfig, sfuConfigEquals } from "./openIDSFU";

/*
 * Additional values for states that a call can be in, beyond what livekit
 * provides in ConnectionState. Also reconnects the call if the SFU Config
 * changes.
 */
export enum ECAddonConnectionState {
  // We are switching from one focus to another (or between livekit room aliases on the same focus)
  ECSwitchingFocus = "ec_switching_focus",
  // The call has just been initialised and is waiting for credentials to arrive before attempting
  // to connect. This distinguishes from the 'Disconected' state which is now just for when livekit
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
  audioOptions: AudioCaptureOptions,
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
      audio: audioOptions,
    });
    if (audioTracks.length < 1) {
      logger.info("Tried to pre-create local audio track but got no tracks");
    } else {
      preCreatedAudioTrack = audioTracks[0];
    }
    logger.info("Pre-created microphone track");
  } catch (e) {
    logger.error("Failed to pre-create microphone track", e);
  }

  if (!audioEnabled) await preCreatedAudioTrack?.mute();

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

  logger.info("Connecting & publishing");
  try {
    await connectAndPublish(livekitRoom, sfuConfig, preCreatedAudioTrack, []);
  } catch (e) {
    preCreatedAudioTrack?.stop();
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
  await livekitRoom!.connect(sfuConfig!.url, sfuConfig!.jwt);

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
    livekitRoom.localParticipant.publishTrack(st, {
      source: Track.Source.ScreenShare,
    });
  }
}

export function useECConnectionState(
  initialAudioOptions: AudioCaptureOptions,
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

  const onConnStateChanged = useCallback((state: ConnectionState) => {
    if (state == ConnectionState.Connected) setSwitchingFocus(false);
    setConnState(state);
  }, []);

  useEffect(() => {
    const oldRoom = livekitRoom;

    if (livekitRoom) {
      livekitRoom.on(RoomEvent.ConnectionStateChanged, onConnStateChanged);
    }

    return () => {
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

      doFocusSwitch();
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
      doConnect(
        livekitRoom!,
        sfuConfig!,
        initialAudioEnabled,
        initialAudioOptions,
      ).finally(() => setIsInDoConnect(false));
    }

    currentSFUConfig.current = Object.assign({}, sfuConfig);
  }, [
    sfuConfig,
    livekitRoom,
    initialAudioOptions,
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
