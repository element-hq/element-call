/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import { useCallback, useEffect, useState } from "react";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { CallFeed, CallFeedEvent } from "matrix-js-sdk/src/webrtc/callFeed";
import { logger } from "matrix-js-sdk/src/logger";

import { PlayClipFunction, PTTClipID } from "../sound/usePttSounds";

// Works out who the active speaker should be given what feeds are active and
// the power level of each user.
function getActiveSpeakerFeed(
  feeds: CallFeed[],
  groupCall: GroupCall
): CallFeed | null {
  const activeSpeakerFeeds = feeds.filter((f) => !f.isAudioMuted());

  let activeSpeakerFeed = null;
  let highestPowerLevel = null;
  for (const feed of activeSpeakerFeeds) {
    const member = groupCall.room.getMember(feed.userId);
    if (highestPowerLevel === null || member.powerLevel > highestPowerLevel) {
      highestPowerLevel = member.powerLevel;
      activeSpeakerFeed = feed;
    }
  }

  return activeSpeakerFeed;
}

export interface PTTState {
  pttButtonHeld: boolean;
  isAdmin: boolean;
  talkOverEnabled: boolean;
  setTalkOverEnabled: (boolean) => void;
  activeSpeakerUserId: string;
  activeSpeakerVolume: number;
  startTalking: () => void;
  stopTalking: () => void;
  transmitBlocked: boolean;
}

export const usePTT = (
  client: MatrixClient,
  groupCall: GroupCall,
  userMediaFeeds: CallFeed[],
  playClip: PlayClipFunction,
  enablePTTButton: boolean
): PTTState => {
  // Used to serialise all the mute calls so they don't race. It has
  // its own state as its always set separately from anything else.
  const [mutePromise, setMutePromise] = useState(
    Promise.resolve<boolean | void>(false)
  );

  // Wrapper to serialise all the mute operations on the promise
  const setMicMuteWrapper = useCallback(
    (muted: boolean) => {
      setMutePromise(
        mutePromise.then(() => {
          return groupCall.setMicrophoneMuted(muted).catch((e) => {
            logger.error("Failed to unmute microphone", e);
          });
        })
      );
    },
    [groupCall, mutePromise]
  );

  const [
    {
      pttButtonHeld,
      isAdmin,
      talkOverEnabled,
      activeSpeakerUserId,
      activeSpeakerVolume,
      transmitBlocked,
    },
    setState,
  ] = useState(() => {
    const roomMember = groupCall.room.getMember(client.getUserId());

    const activeSpeakerFeed = getActiveSpeakerFeed(userMediaFeeds, groupCall);

    return {
      isAdmin: roomMember.powerLevel >= 100,
      talkOverEnabled: false,
      pttButtonHeld: false,
      activeSpeakerUserId: activeSpeakerFeed ? activeSpeakerFeed.userId : null,
      activeSpeakerVolume: -Infinity,
      transmitBlocked: false,
    };
  });

  const onMuteStateChanged = useCallback(() => {
    const activeSpeakerFeed = getActiveSpeakerFeed(userMediaFeeds, groupCall);

    let blocked = false;
    if (activeSpeakerUserId === null && activeSpeakerFeed !== null) {
      if (activeSpeakerFeed.userId === client.getUserId()) {
        playClip(PTTClipID.START_TALKING_LOCAL);
      } else {
        playClip(PTTClipID.START_TALKING_REMOTE);
      }
    } else if (activeSpeakerUserId !== null && activeSpeakerFeed === null) {
      playClip(PTTClipID.END_TALKING);
    } else if (
      pttButtonHeld &&
      activeSpeakerUserId === client.getUserId() &&
      activeSpeakerFeed?.userId !== client.getUserId()
    ) {
      // We were talking but we've been cut off: mute our own mic
      // (this is the easier way of cutting other speakers off if an
      // admin barges in: we could also mute the non-admin speaker
      // on all receivers, but we'd have to make sure we unmuted them
      // correctly.)
      setMicMuteWrapper(true);
      blocked = true;
      playClip(PTTClipID.BLOCKED);
    }

    setState((prevState) => ({
      ...prevState,
      activeSpeakerUserId: activeSpeakerFeed ? activeSpeakerFeed.userId : null,
      transmitBlocked: blocked,
    }));
  }, [
    playClip,
    groupCall,
    pttButtonHeld,
    activeSpeakerUserId,
    client,
    userMediaFeeds,
    setMicMuteWrapper,
  ]);

  useEffect(() => {
    for (const callFeed of userMediaFeeds) {
      callFeed.on(CallFeedEvent.MuteStateChanged, onMuteStateChanged);
    }

    const activeSpeakerFeed = getActiveSpeakerFeed(userMediaFeeds, groupCall);

    setState((prevState) => ({
      ...prevState,
      activeSpeakerUserId: activeSpeakerFeed ? activeSpeakerFeed.userId : null,
    }));

    return () => {
      for (const callFeed of userMediaFeeds) {
        callFeed.off(CallFeedEvent.MuteStateChanged, onMuteStateChanged);
      }
    };
  }, [userMediaFeeds, onMuteStateChanged, groupCall]);

  const onVolumeChanged = useCallback((volume: number) => {
    setState((prevState) => ({
      ...prevState,
      activeSpeakerVolume: volume,
    }));
  }, []);

  useEffect(() => {
    const activeSpeakerFeed = getActiveSpeakerFeed(userMediaFeeds, groupCall);
    activeSpeakerFeed?.on(CallFeedEvent.VolumeChanged, onVolumeChanged);
    return () => {
      activeSpeakerFeed?.off(CallFeedEvent.VolumeChanged, onVolumeChanged);
      setState((prevState) => ({
        ...prevState,
        activeSpeakerVolume: -Infinity,
      }));
    };
  }, [activeSpeakerUserId, onVolumeChanged, userMediaFeeds, groupCall]);

  const startTalking = useCallback(async () => {
    if (pttButtonHeld) return;

    let blocked = false;
    if (activeSpeakerUserId && !(isAdmin && talkOverEnabled)) {
      playClip(PTTClipID.BLOCKED);
      blocked = true;
    }
    // setstate before doing the async call to mute / unmute the mic
    setState((prevState) => ({
      ...prevState,
      pttButtonHeld: true,
      transmitBlocked: blocked,
    }));

    if (!blocked && groupCall.isMicrophoneMuted()) {
      setMicMuteWrapper(false);
    }
  }, [
    pttButtonHeld,
    groupCall,
    activeSpeakerUserId,
    isAdmin,
    talkOverEnabled,
    setState,
    playClip,
    setMicMuteWrapper,
  ]);

  const stopTalking = useCallback(async () => {
    setState((prevState) => ({
      ...prevState,
      pttButtonHeld: false,
      transmitBlocked: false,
    }));

    setMicMuteWrapper(true);
  }, [setMicMuteWrapper]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.code === "Space") {
        if (!enablePTTButton) return;

        event.preventDefault();

        if (pttButtonHeld) return;

        startTalking();
      }
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (event.code === "Space") {
        event.preventDefault();

        stopTalking();
      }
    }

    function onBlur(): void {
      // TODO: We will need to disable this for a global PTT hotkey to work
      if (!groupCall.isMicrophoneMuted()) {
        setMicMuteWrapper(true);
      }

      setState((prevState) => ({ ...prevState, pttButtonHeld: false }));
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    groupCall,
    startTalking,
    stopTalking,
    activeSpeakerUserId,
    isAdmin,
    talkOverEnabled,
    pttButtonHeld,
    enablePTTButton,
    setMicMuteWrapper,
  ]);

  const setTalkOverEnabled = useCallback((talkOverEnabled) => {
    setState((prevState) => ({
      ...prevState,
      talkOverEnabled,
    }));
  }, []);

  return {
    pttButtonHeld,
    isAdmin,
    talkOverEnabled,
    setTalkOverEnabled,
    activeSpeakerUserId,
    activeSpeakerVolume,
    startTalking,
    stopTalking,
    transmitBlocked,
  };
};
