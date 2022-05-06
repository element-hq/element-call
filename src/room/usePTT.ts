import { useCallback, useEffect, useState } from "react";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { CallFeed } from "matrix-js-sdk/src/webrtc/callFeed";

export interface PTTState {
  pttButtonHeld: boolean;
  isAdmin: boolean;
  talkOverEnabled: boolean;
  setTalkOverEnabled: (boolean) => void;
  activeSpeakerUserId: string;
  startTalking: () => void;
  stopTalking: () => void;
}

export const usePTT = (
  client: MatrixClient,
  groupCall: GroupCall,
  userMediaFeeds: CallFeed[]
): PTTState => {
  const [
    { pttButtonHeld, isAdmin, talkOverEnabled, activeSpeakerUserId },
    setState,
  ] = useState(() => {
    const roomMember = groupCall.room.getMember(client.getUserId());

    const activeSpeakerFeed = userMediaFeeds.find((f) => !f.isAudioMuted());

    return {
      isAdmin: roomMember.powerLevel >= 100,
      talkOverEnabled: false,
      pttButtonHeld: false,
      activeSpeakerUserId: activeSpeakerFeed ? activeSpeakerFeed.userId : null,
    };
  });

  useEffect(() => {
    function onMuteStateChanged(...args): void {
      const activeSpeakerFeed = userMediaFeeds.find((f) => !f.isAudioMuted());

      setState((prevState) => ({
        ...prevState,
        activeSpeakerUserId: activeSpeakerFeed
          ? activeSpeakerFeed.userId
          : null,
      }));
    }

    for (const callFeed of userMediaFeeds) {
      callFeed.addListener("mute_state_changed", onMuteStateChanged);
    }

    const activeSpeakerFeed = userMediaFeeds.find((f) => !f.isAudioMuted());

    setState((prevState) => ({
      ...prevState,
      activeSpeakerUserId: activeSpeakerFeed ? activeSpeakerFeed.userId : null,
    }));

    return () => {
      for (const callFeed of userMediaFeeds) {
        callFeed.removeListener("mute_state_changed", onMuteStateChanged);
      }
    };
  }, [userMediaFeeds]);

  const startTalking = useCallback(() => {
    if (!activeSpeakerUserId || isAdmin || talkOverEnabled) {
      if (groupCall.isMicrophoneMuted()) {
        groupCall.setMicrophoneMuted(false);
      }

      setState((prevState) => ({ ...prevState, pttButtonHeld: true }));
    }
  }, []);

  const stopTalking = useCallback(() => {
    if (!groupCall.isMicrophoneMuted()) {
      groupCall.setMicrophoneMuted(true);
    }

    setState((prevState) => ({ ...prevState, pttButtonHeld: false }));
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.code === "Space") {
        event.preventDefault();

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
  }, [activeSpeakerUserId, isAdmin, talkOverEnabled]);

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
  };
};
