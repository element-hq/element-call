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

export interface PTTState {
  pttButtonHeld: boolean;
  isAdmin: boolean;
  talkOverEnabled: boolean;
  setTalkOverEnabled: (boolean) => void;
  activeSpeakerUserId: string;
  startTalking: () => void;
  stopTalking: () => void;
  transmitBlocked: boolean;
}

export const usePTT = (
  client: MatrixClient,
  groupCall: GroupCall,
  userMediaFeeds: CallFeed[],
  playClip: PlayClipFunction
): PTTState => {
  const [
    {
      pttButtonHeld,
      isAdmin,
      talkOverEnabled,
      activeSpeakerUserId,
      transmitBlocked,
    },
    setState,
  ] = useState(() => {
    const roomMember = groupCall.room.getMember(client.getUserId());

    const activeSpeakerFeed = userMediaFeeds.find((f) => !f.isAudioMuted());

    return {
      isAdmin: roomMember.powerLevel >= 100,
      talkOverEnabled: false,
      pttButtonHeld: false,
      activeSpeakerUserId: activeSpeakerFeed ? activeSpeakerFeed.userId : null,
      transmitBlocked: false,
    };
  });

  useEffect(() => {
    function onMuteStateChanged(...args): void {
      const activeSpeakerFeed = userMediaFeeds.find((f) => !f.isAudioMuted());

      if (activeSpeakerUserId === null && activeSpeakerFeed.userId !== null) {
        if (activeSpeakerFeed.userId === client.getUserId()) {
          playClip(PTTClipID.START_TALKING_LOCAL);
        } else {
          playClip(PTTClipID.START_TALKING_REMOTE);
        }
      } else if (
        activeSpeakerFeed &&
        activeSpeakerUserId === client.getUserId() &&
        activeSpeakerFeed.userId !== client.getUserId()
      ) {
        // We were talking but we've been cut off
        playClip(PTTClipID.BLOCKED);
      }

      setState((prevState) => ({
        ...prevState,
        activeSpeakerUserId: activeSpeakerFeed
          ? activeSpeakerFeed.userId
          : null,
      }));
    }

    for (const callFeed of userMediaFeeds) {
      callFeed.addListener(CallFeedEvent.MuteStateChanged, onMuteStateChanged);
    }

    const activeSpeakerFeed = userMediaFeeds.find((f) => !f.isAudioMuted());

    setState((prevState) => ({
      ...prevState,
      activeSpeakerUserId: activeSpeakerFeed ? activeSpeakerFeed.userId : null,
    }));

    return () => {
      for (const callFeed of userMediaFeeds) {
        callFeed.removeListener(
          CallFeedEvent.MuteStateChanged,
          onMuteStateChanged
        );
      }
    };
  }, [userMediaFeeds, activeSpeakerUserId, client, playClip]);

  const startTalking = useCallback(async () => {
    if (pttButtonHeld) return;

    let blocked = false;
    if (!activeSpeakerUserId || (isAdmin && talkOverEnabled)) {
      if (groupCall.isMicrophoneMuted()) {
        try {
          await groupCall.setMicrophoneMuted(false);
        } catch (e) {
          logger.error("Failed to unmute microphone", e);
        }
      }
    } else {
      playClip(PTTClipID.BLOCKED);
      blocked = true;
    }
    setState((prevState) => ({
      ...prevState,
      pttButtonHeld: true,
      transmitBlocked: blocked,
    }));
  }, [
    pttButtonHeld,
    groupCall,
    activeSpeakerUserId,
    isAdmin,
    talkOverEnabled,
    setState,
    playClip,
  ]);

  const stopTalking = useCallback(() => {
    setState((prevState) => ({
      ...prevState,
      pttButtonHeld: false,
      unmuteError: null,
    }));

    if (!groupCall.isMicrophoneMuted()) {
      groupCall.setMicrophoneMuted(true);
    }

    setState((prevState) => ({
      ...prevState,
      pttButtonHeld: false,
      transmitBlocked: false,
    }));
  }, [groupCall]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.code === "Space") {
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
        groupCall.setMicrophoneMuted(true);
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
    startTalking,
    stopTalking,
    transmitBlocked,
  };
};
