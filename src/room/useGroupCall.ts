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

import { useCallback, useEffect, useReducer, useState } from "react";
import {
  GroupCallEvent,
  GroupCallState,
  GroupCall,
  GroupCallErrorCode,
  GroupCallUnknownDeviceError,
  GroupCallError,
} from "matrix-js-sdk/src/webrtc/groupCall";
import { MatrixCall } from "matrix-js-sdk/src/webrtc/call";
import { CallFeed } from "matrix-js-sdk/src/webrtc/callFeed";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { useTranslation } from "react-i18next";

import { usePageUnload } from "./usePageUnload";
import { TranslatedError, translatedError } from "../TranslatedError";

export interface UseGroupCallReturnType {
  state: GroupCallState;
  calls: MatrixCall[];
  localCallFeed: CallFeed;
  activeSpeaker: string;
  userMediaFeeds: CallFeed[];
  microphoneMuted: boolean;
  localVideoMuted: boolean;
  error: TranslatedError | null;
  initLocalCallFeed: () => void;
  enter: () => void;
  leave: () => void;
  toggleLocalVideoMuted: () => void;
  toggleMicrophoneMuted: () => void;
  toggleScreensharing: () => void;
  requestingScreenshare: boolean;
  isScreensharing: boolean;
  screenshareFeeds: CallFeed[];
  localDesktopCapturerSourceId: string;
  participants: RoomMember[];
  hasLocalParticipant: boolean;
  unencryptedEventsFromUsers: Set<string>;
}

interface State {
  state: GroupCallState;
  calls: MatrixCall[];
  localCallFeed: CallFeed;
  activeSpeaker: string;
  userMediaFeeds: CallFeed[];
  error: TranslatedError | null;
  microphoneMuted: boolean;
  localVideoMuted: boolean;
  screenshareFeeds: CallFeed[];
  localDesktopCapturerSourceId: string;
  isScreensharing: boolean;
  requestingScreenshare: boolean;
  participants: RoomMember[];
  hasLocalParticipant: boolean;
}

export function useGroupCall(groupCall: GroupCall): UseGroupCallReturnType {
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
      localDesktopCapturerSourceId,
      participants,
      hasLocalParticipant,
      requestingScreenshare,
    },
    setState,
  ] = useState<State>({
    state: GroupCallState.LocalCallFeedUninitialized,
    calls: [],
    localCallFeed: null,
    activeSpeaker: null,
    userMediaFeeds: [],
    error: null,
    microphoneMuted: false,
    localVideoMuted: false,
    isScreensharing: false,
    screenshareFeeds: [],
    localDesktopCapturerSourceId: null,
    requestingScreenshare: false,
    participants: [],
    hasLocalParticipant: false,
  });

  const [unencryptedEventsFromUsers, addUnencryptedEventUser] = useReducer(
    (state: Set<string>, newVal: string) => {
      return new Set(state).add(newVal);
    },
    new Set<string>()
  );

  const updateState = (state: Partial<State>) =>
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
        localDesktopCapturerSourceId: groupCall.localDesktopCapturerSourceId,
        screenshareFeeds: [...groupCall.screenshareFeeds],
        participants: [...groupCall.participants],
      });
    }

    function onUserMediaFeedsChanged(userMediaFeeds: CallFeed[]): void {
      updateState({
        userMediaFeeds: [...userMediaFeeds],
      });
    }

    function onScreenshareFeedsChanged(screenshareFeeds: CallFeed[]): void {
      updateState({
        screenshareFeeds: [...screenshareFeeds],
      });
    }

    function onActiveSpeakerChanged(activeSpeaker: string): void {
      updateState({
        activeSpeaker: activeSpeaker,
      });
    }

    function onLocalMuteStateChanged(
      microphoneMuted: boolean,
      localVideoMuted: boolean
    ): void {
      updateState({
        microphoneMuted,
        localVideoMuted,
      });
    }

    function onLocalScreenshareStateChanged(
      isScreensharing: boolean,
      _localScreenshareFeed: CallFeed,
      localDesktopCapturerSourceId: string
    ): void {
      updateState({
        isScreensharing,
        localDesktopCapturerSourceId,
      });
    }

    function onCallsChanged(calls: MatrixCall[]): void {
      updateState({
        calls: [...calls],
      });
    }

    function onParticipantsChanged(participants: RoomMember[]): void {
      updateState({
        participants: [...participants],
        hasLocalParticipant: groupCall.hasLocalParticipant(),
      });
    }

    function onError(e: GroupCallError): void {
      if (e.code === GroupCallErrorCode.UnknownDevice) {
        const unknownDeviceError = e as GroupCallUnknownDeviceError;
        addUnencryptedEventUser(unknownDeviceError.userId);
      }
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
    groupCall.on(GroupCallEvent.Error, onError);

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
      groupCall.removeListener(GroupCallEvent.Error, onError);
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

    groupCall
      .setScreensharingEnabled(!groupCall.isScreensharing(), { audio: true })
      .then(() => {
        updateState({ requestingScreenshare: false });
      });
  }, [groupCall]);

  const { t } = useTranslation();

  useEffect(() => {
    if (window.RTCPeerConnection === undefined) {
      const error = translatedError(
        "WebRTC is not supported or is being blocked in this browser.",
        t
      );
      console.error(error);
      updateState({ error });
    }
  }, [t]);

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
    localDesktopCapturerSourceId,
    participants,
    hasLocalParticipant,
    unencryptedEventsFromUsers,
  };
}
