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
  LocalTrackPublication,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";

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
  audioOptions: AudioCaptureOptions
): Promise<void> {
  await livekitRoom!.connect(sfuConfig!.url, sfuConfig!.jwt);
  const hasMicrophoneTrack = Array.from(
    livekitRoom?.localParticipant.audioTracks.values()
  ).some((track: LocalTrackPublication) => {
    return track.source == Track.Source.Microphone;
  });
  // We create a track in case there isn't any.
  if (!hasMicrophoneTrack) {
    const audioTracks = await livekitRoom!.localParticipant.createTracks({
      audio: audioOptions,
    });
    if (audioTracks.length < 1) {
      logger.info("Tried to pre-create local audio track but got no tracks");
      return;
    }
    if (!audioEnabled) await audioTracks[0].mute();

    await livekitRoom?.localParticipant.publishTrack(audioTracks[0]);
  }
}

export function useECConnectionState(
  initialAudioOptions: AudioCaptureOptions,
  initialAudioEnabled: boolean,
  livekitRoom?: Room,
  sfuConfig?: SFUConfig
): ECConnectionState {
  const [connState, setConnState] = useState(
    sfuConfig && livekitRoom
      ? livekitRoom.state
      : ECAddonConnectionState.ECWaiting
  );

  const [isSwitchingFocus, setSwitchingFocus] = useState(false);
  const [isInDoConnect, setIsInDoConnect] = useState(false)

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
        `SFU config changed! URL was ${currentSFUConfig.current?.url} now ${sfuConfig?.url}`
      );

      (async () => {
        setSwitchingFocus(true);
        await livekitRoom?.disconnect();
        setIsInDoConnect(true)
        try {
          await doConnect(
            livekitRoom!,
            sfuConfig!,
            initialAudioEnabled,
            initialAudioOptions
          );
        } finally {
          setIsInDoConnect(false)
        }
      })();
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
      setIsInDoConnect(true)
      doConnect(
        livekitRoom!,
        sfuConfig!,
        initialAudioEnabled,
        initialAudioOptions
      ).finally(() => setIsInDoConnect(false));
    }

    currentSFUConfig.current = Object.assign({}, sfuConfig);
  }, [sfuConfig, livekitRoom, initialAudioOptions, initialAudioEnabled]);

  return isSwitchingFocus ? ECAddonConnectionState.ECSwitchingFocus : isInDoConnect ? ConnectionState.Connecting : connState;
}
