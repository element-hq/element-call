import { useCallback, useEffect, useState } from "react";

export function usePTT(client, groupCall, userMediaFeeds) {
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
    function onMuteStateChanged(...args) {
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
  }, [groupCall, activeSpeakerUserId, isAdmin, talkOverEnabled]);

  const stopTalking = useCallback(() => {
    if (!groupCall.isMicrophoneMuted()) {
      groupCall.setMicrophoneMuted(true);
    }

    setState((prevState) => ({ ...prevState, pttButtonHeld: false }));
  }, [groupCall]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.code === "Space") {
        event.preventDefault();

        startTalking();
      }
    }

    function onKeyUp(event) {
      if (event.code === "Space") {
        event.preventDefault();

        stopTalking();
      }
    }

    function onBlur() {
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
  };
}
