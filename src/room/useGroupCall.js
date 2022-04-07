import { useCallback, useEffect, useState } from "react";
import {
  GroupCallEvent,
  GroupCallState,
} from "matrix-js-sdk/src/webrtc/groupCall";
import { usePageUnload } from "./usePageUnload";

export function useGroupCall(groupCall) {
  const [
    {
      state,
      calls,
      localCallFeed,
      activeSpeaker,
      userMediaFeeds,
      error,
      microphoneMuted,
      localVideoMuted,
      isScreensharing,
      screenshareFeeds,
      localScreenshareFeed,
      localDesktopCapturerSourceId,
      participants,
      hasLocalParticipant,
      requestingScreenshare,
    },
    setState,
  ] = useState({
    state: GroupCallState.LocalCallFeedUninitialized,
    calls: [],
    userMediaFeeds: [],
    microphoneMuted: false,
    localVideoMuted: false,
    screenshareFeeds: [],
    isScreensharing: false,
    requestingScreenshare: false,
    participants: [],
    hasLocalParticipant: false,
  });

  const updateState = (state) =>
    setState((prevState) => ({ ...prevState, ...state }));

  useEffect(() => {
    function onGroupCallStateChanged() {
      updateState({
        state: groupCall.state,
        calls: [...groupCall.calls],
        localCallFeed: groupCall.localCallFeed,
        activeSpeaker: groupCall.activeSpeaker,
        userMediaFeeds: [...groupCall.userMediaFeeds],
        microphoneMuted: groupCall.isMicrophoneMuted(),
        localVideoMuted: groupCall.isLocalVideoMuted(),
        isScreensharing: groupCall.isScreensharing(),
        localScreenshareFeed: groupCall.localScreenshareFeed,
        localDesktopCapturerSourceId: groupCall.localDesktopCapturerSourceId,
        screenshareFeeds: [...groupCall.screenshareFeeds],
        participants: [...groupCall.participants],
      });
    }

    function onUserMediaFeedsChanged(userMediaFeeds) {
      updateState({
        userMediaFeeds: [...userMediaFeeds],
      });
    }

    function onScreenshareFeedsChanged(screenshareFeeds) {
      updateState({
        screenshareFeeds: [...screenshareFeeds],
      });
    }

    function onActiveSpeakerChanged(activeSpeaker) {
      updateState({
        activeSpeaker: activeSpeaker,
      });
    }

    function onLocalMuteStateChanged(microphoneMuted, localVideoMuted) {
      updateState({
        microphoneMuted,
        localVideoMuted,
      });
    }

    function onLocalScreenshareStateChanged(
      isScreensharing,
      localScreenshareFeed,
      localDesktopCapturerSourceId
    ) {
      updateState({
        isScreensharing,
        localScreenshareFeed,
        localDesktopCapturerSourceId,
      });
    }

    function onCallsChanged(calls) {
      updateState({
        calls: [...calls],
      });
    }

    function onParticipantsChanged(participants) {
      updateState({
        participants: [...participants],
        hasLocalParticipant: groupCall.hasLocalParticipant(),
      });
    }

    groupCall.on(GroupCallEvent.GroupCallStateChanged, onGroupCallStateChanged);
    groupCall.on(GroupCallEvent.UserMediaFeedsChanged, onUserMediaFeedsChanged);
    groupCall.on(
      GroupCallEvent.ScreenshareFeedsChanged,
      onScreenshareFeedsChanged
    );
    groupCall.on(GroupCallEvent.ActiveSpeakerChanged, onActiveSpeakerChanged);
    groupCall.on(GroupCallEvent.LocalMuteStateChanged, onLocalMuteStateChanged);
    groupCall.on(
      GroupCallEvent.LocalScreenshareStateChanged,
      onLocalScreenshareStateChanged
    );
    groupCall.on(GroupCallEvent.CallsChanged, onCallsChanged);
    groupCall.on(GroupCallEvent.ParticipantsChanged, onParticipantsChanged);

    updateState({
      error: null,
      state: groupCall.state,
      calls: [...groupCall.calls],
      localCallFeed: groupCall.localCallFeed,
      activeSpeaker: groupCall.activeSpeaker,
      userMediaFeeds: [...groupCall.userMediaFeeds],
      microphoneMuted: groupCall.isMicrophoneMuted(),
      localVideoMuted: groupCall.isLocalVideoMuted(),
      isScreensharing: groupCall.isScreensharing(),
      localScreenshareFeed: groupCall.localScreenshareFeed,
      localDesktopCapturerSourceId: groupCall.localDesktopCapturerSourceId,
      screenshareFeeds: [...groupCall.screenshareFeeds],
      participants: [...groupCall.participants],
      hasLocalParticipant: groupCall.hasLocalParticipant(),
    });

    return () => {
      groupCall.removeListener(
        GroupCallEvent.GroupCallStateChanged,
        onGroupCallStateChanged
      );
      groupCall.removeListener(
        GroupCallEvent.UserMediaFeedsChanged,
        onUserMediaFeedsChanged
      );
      groupCall.removeListener(
        GroupCallEvent.ScreenshareFeedsChanged,
        onScreenshareFeedsChanged
      );
      groupCall.removeListener(
        GroupCallEvent.ActiveSpeakerChanged,
        onActiveSpeakerChanged
      );
      groupCall.removeListener(
        GroupCallEvent.LocalMuteStateChanged,
        onLocalMuteStateChanged
      );
      groupCall.removeListener(
        GroupCallEvent.LocalScreenshareStateChanged,
        onLocalScreenshareStateChanged
      );
      groupCall.removeListener(GroupCallEvent.CallsChanged, onCallsChanged);
      groupCall.removeListener(
        GroupCallEvent.ParticipantsChanged,
        onParticipantsChanged
      );
      groupCall.leave();
    };
  }, [groupCall]);

  usePageUnload(() => {
    groupCall.leave();
  });

  const initLocalCallFeed = useCallback(
    () => groupCall.initLocalCallFeed(),
    [groupCall]
  );

  const enter = useCallback(() => {
    if (
      groupCall.state !== GroupCallState.LocalCallFeedUninitialized &&
      groupCall.state !== GroupCallState.LocalCallFeedInitialized
    ) {
      return;
    }

    groupCall.enter().catch((error) => {
      console.error(error);
      updateState({ error });
    });
  }, [groupCall]);

  const leave = useCallback(() => groupCall.leave(), [groupCall]);

  const toggleLocalVideoMuted = useCallback(() => {
    groupCall.setLocalVideoMuted(!groupCall.isLocalVideoMuted());
  }, [groupCall]);

  const toggleMicrophoneMuted = useCallback(() => {
    groupCall.setMicrophoneMuted(!groupCall.isMicrophoneMuted());
  }, [groupCall]);

  const toggleScreensharing = useCallback(() => {
    updateState({ requestingScreenshare: true });

    groupCall.setScreensharingEnabled(!groupCall.isScreensharing()).then(() => {
      updateState({ requestingScreenshare: false });
    });
  }, [groupCall]);

  useEffect(() => {
    if (window.RTCPeerConnection === undefined) {
      const error = new Error(
        "WebRTC is not supported or is being blocked in this browser."
      );
      console.error(error);
      updateState({ error });
    }
  }, []);

  return {
    state,
    calls,
    localCallFeed,
    activeSpeaker,
    userMediaFeeds,
    microphoneMuted,
    localVideoMuted,
    error,
    initLocalCallFeed,
    enter,
    leave,
    toggleLocalVideoMuted,
    toggleMicrophoneMuted,
    toggleScreensharing,
    requestingScreenshare,
    isScreensharing,
    screenshareFeeds,
    localScreenshareFeed,
    localDesktopCapturerSourceId,
    participants,
    hasLocalParticipant,
  };
}
