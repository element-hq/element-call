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
import { CallFeed, CallFeedEvent } from "matrix-js-sdk/src/webrtc/callFeed";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { useTranslation } from "react-i18next";
import { IWidgetApiRequest } from "matrix-widget-api";

import { usePageUnload } from "./usePageUnload";
import { PosthogAnalytics } from "../PosthogAnalytics";
import { TranslatedError, translatedError } from "../TranslatedError";
import { ElementWidgetActions, ScreenshareStartData, widget } from "../widget";
import { getSetting } from "../settings/useSetting";
import { useEventTarget } from "../useEvents";

export enum ConnectionState {
  EstablishingCall = "establishing call", // call hasn't been established yet
  WaitMedia = "wait_media", // call is set up, waiting for ICE to connect
  Connected = "connected", // media is flowing
}

export interface ParticipantInfo {
  connectionState: ConnectionState;
  presenter: boolean;
}

export interface UseGroupCallReturnType {
  state: GroupCallState;
  localCallFeed: CallFeed;
  activeSpeaker: CallFeed | null;
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
  localDesktopCapturerSourceId: string; // XXX: This looks unused?
  participants: Map<RoomMember, Map<string, ParticipantInfo>>;
  hasLocalParticipant: boolean;
  unencryptedEventsFromUsers: Set<string>;
}

interface State {
  state: GroupCallState;
  localCallFeed: CallFeed;
  activeSpeaker: CallFeed | null;
  userMediaFeeds: CallFeed[];
  error: TranslatedError | null;
  microphoneMuted: boolean;
  localVideoMuted: boolean;
  screenshareFeeds: CallFeed[];
  localDesktopCapturerSourceId: string;
  isScreensharing: boolean;
  requestingScreenshare: boolean;
  participants: Map<RoomMember, Map<string, ParticipantInfo>>;
  hasLocalParticipant: boolean;
}

function getParticipants(
  groupCall: GroupCall
): Map<RoomMember, Map<string, ParticipantInfo>> {
  const participants = new Map<RoomMember, Map<string, ParticipantInfo>>();

  for (const [member, participantsStateMap] of groupCall.participants) {
    const participantInfoMap = new Map<string, ParticipantInfo>();
    participants.set(member, participantInfoMap);

    for (const [deviceId, participant] of participantsStateMap) {
      const feed = groupCall.userMediaFeeds.find(
        (f) => f.userId === member.userId && f.deviceId === deviceId
      );

      participantInfoMap.set(deviceId, {
        connectionState: feed
          ? feed.connected
            ? ConnectionState.Connected
            : ConnectionState.WaitMedia
          : ConnectionState.EstablishingCall,
        presenter: participant.screensharing,
      });
    }
  }

  return participants;
}

export function useGroupCall(groupCall: GroupCall): UseGroupCallReturnType {
  const [
    {
      state,
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
    participants: new Map(),
    hasLocalParticipant: false,
  });

  const [unencryptedEventsFromUsers, addUnencryptedEventUser] = useReducer(
    (state: Set<string>, newVal: string) => {
      return new Set(state).add(newVal);
    },
    new Set<string>()
  );

  const updateState = useCallback(
    (state: Partial<State>) => setState((prev) => ({ ...prev, ...state })),
    [setState]
  );

  useEffect(() => {
    function onGroupCallStateChanged() {
      updateState({
        state: groupCall.state,
        localCallFeed: groupCall.localCallFeed,
        activeSpeaker: groupCall.activeSpeaker ?? null,
        userMediaFeeds: [...groupCall.userMediaFeeds],
        microphoneMuted: groupCall.isMicrophoneMuted(),
        localVideoMuted: groupCall.isLocalVideoMuted(),
        isScreensharing: groupCall.isScreensharing(),
        localDesktopCapturerSourceId: groupCall.localDesktopCapturerSourceId,
        screenshareFeeds: [...groupCall.screenshareFeeds],
      });
    }

    const prevUserMediaFeeds = new Set<CallFeed>();

    function onUserMediaFeedsChanged(userMediaFeeds: CallFeed[]): void {
      for (const feed of prevUserMediaFeeds) {
        feed.off(CallFeedEvent.ConnectedChanged, onConnectedChanged);
      }
      prevUserMediaFeeds.clear();

      for (const feed of userMediaFeeds) {
        feed.on(CallFeedEvent.ConnectedChanged, onConnectedChanged);
        prevUserMediaFeeds.add(feed);
      }

      updateState({
        userMediaFeeds: [...userMediaFeeds],
        participants: getParticipants(groupCall),
      });
    }

    const prevScreenshareFeeds = new Set<CallFeed>();

    function onScreenshareFeedsChanged(screenshareFeeds: CallFeed[]): void {
      for (const feed of prevScreenshareFeeds) {
        feed.off(CallFeedEvent.ConnectedChanged, onConnectedChanged);
      }
      prevScreenshareFeeds.clear();

      for (const feed of screenshareFeeds) {
        feed.on(CallFeedEvent.ConnectedChanged, onConnectedChanged);
        prevScreenshareFeeds.add(feed);
      }

      updateState({
        screenshareFeeds: [...screenshareFeeds],
      });
    }

    function onConnectedChanged(connected: boolean): void {
      updateState({
        participants: getParticipants(groupCall),
      });
    }

    function onActiveSpeakerChanged(activeSpeaker: CallFeed | undefined): void {
      updateState({
        activeSpeaker: activeSpeaker ?? null,
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

    function onCallsChanged(): void {
      updateState({ participants: getParticipants(groupCall) });
    }

    function onParticipantsChanged(): void {
      updateState({
        participants: getParticipants(groupCall),
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
      localCallFeed: groupCall.localCallFeed,
      activeSpeaker: groupCall.activeSpeaker ?? null,
      userMediaFeeds: [...groupCall.userMediaFeeds],
      microphoneMuted: groupCall.isMicrophoneMuted(),
      localVideoMuted: groupCall.isLocalVideoMuted(),
      isScreensharing: groupCall.isScreensharing(),
      localDesktopCapturerSourceId: groupCall.localDesktopCapturerSourceId,
      screenshareFeeds: [...groupCall.screenshareFeeds],
      participants: getParticipants(groupCall),
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
  }, [groupCall, updateState]);

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

    PosthogAnalytics.instance.eventCallEnded.cacheStartCall(new Date());
    PosthogAnalytics.instance.eventCallStarted.track(groupCall.groupCallId);

    groupCall.enter().catch((error) => {
      console.error(error);
      updateState({ error });
    });
  }, [groupCall, updateState]);

  const leave = useCallback(() => groupCall.leave(), [groupCall]);

  const toggleLocalVideoMuted = useCallback(() => {
    const toggleToMute = !groupCall.isLocalVideoMuted();
    groupCall.setLocalVideoMuted(toggleToMute);
    PosthogAnalytics.instance.eventMuteCamera.track(toggleToMute);
  }, [groupCall]);

  const setMicrophoneMuted = useCallback(
    (setMuted) => {
      groupCall.setMicrophoneMuted(setMuted);
      PosthogAnalytics.instance.eventMuteMicrophone.track(setMuted);
    },
    [groupCall]
  );

  const toggleMicrophoneMuted = useCallback(() => {
    const toggleToMute = !groupCall.isMicrophoneMuted();
    setMicrophoneMuted(toggleToMute);
  }, [groupCall, setMicrophoneMuted]);

  const toggleScreensharing = useCallback(async () => {
    if (!groupCall.isScreensharing()) {
      // toggling on
      updateState({ requestingScreenshare: true });

      try {
        await groupCall.setScreensharingEnabled(true, {
          audio: true,
          throwOnFail: true,
        });
        updateState({ requestingScreenshare: false });
      } catch (e) {
        // this will fail in Electron because getDisplayMedia just throws a permission
        // error, so if we have a widget API, try requesting via that.
        if (widget) {
          const reply = await widget.api.transport.send(
            ElementWidgetActions.ScreenshareRequest,
            {}
          );
          if (!reply.pending) {
            updateState({ requestingScreenshare: false });
          }
        }
      }
    } else {
      // toggling off
      groupCall.setScreensharingEnabled(false);
    }
  }, [groupCall, updateState]);

  const onScreenshareStart = useCallback(
    async (ev: CustomEvent<IWidgetApiRequest>) => {
      updateState({ requestingScreenshare: false });

      const data = ev.detail.data as unknown as ScreenshareStartData;

      await groupCall.setScreensharingEnabled(true, {
        desktopCapturerSourceId: data.desktopCapturerSourceId as string,
        audio: !data.desktopCapturerSourceId,
      });
      await widget.api.transport.reply(ev.detail, {});
    },
    [groupCall, updateState]
  );

  const onScreenshareStop = useCallback(
    async (ev: CustomEvent<IWidgetApiRequest>) => {
      updateState({ requestingScreenshare: false });
      await groupCall.setScreensharingEnabled(false);
      await widget.api.transport.reply(ev.detail, {});
    },
    [groupCall, updateState]
  );

  useEffect(() => {
    if (widget) {
      widget.lazyActions.on(
        ElementWidgetActions.ScreenshareStart,
        onScreenshareStart
      );
      widget.lazyActions.on(
        ElementWidgetActions.ScreenshareStop,
        onScreenshareStop
      );

      return () => {
        widget.lazyActions.off(
          ElementWidgetActions.ScreenshareStart,
          onScreenshareStart
        );
        widget.lazyActions.off(
          ElementWidgetActions.ScreenshareStop,
          onScreenshareStop
        );
      };
    }
  }, [onScreenshareStart, onScreenshareStop]);

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
  }, [t, updateState]);

  const [spacebarHeld, setSpacebarHeld] = useState(false);

  useEventTarget(
    window,
    "keydown",
    useCallback(
      (event: KeyboardEvent) => {
        // Check if keyboard shortcuts are enabled
        const keyboardShortcuts = getSetting("keyboard-shortcuts", true);
        if (!keyboardShortcuts) {
          return;
        }

        if (event.key === "m") {
          toggleMicrophoneMuted();
        } else if (event.key == "v") {
          toggleLocalVideoMuted();
        } else if (event.key === " ") {
          setSpacebarHeld(true);
          setMicrophoneMuted(false);
        }
      },
      [
        toggleLocalVideoMuted,
        toggleMicrophoneMuted,
        setMicrophoneMuted,
        setSpacebarHeld,
      ]
    )
  );

  useEventTarget(
    window,
    "keyup",
    useCallback(
      (event: KeyboardEvent) => {
        // Check if keyboard shortcuts are enabled
        const keyboardShortcuts = getSetting("keyboard-shortcuts", true);
        if (!keyboardShortcuts) {
          return;
        }

        if (event.key === " ") {
          setSpacebarHeld(false);
          setMicrophoneMuted(true);
        }
      },
      [setMicrophoneMuted, setSpacebarHeld]
    )
  );

  useEventTarget(
    window,
    "blur",
    useCallback(() => {
      if (spacebarHeld) {
        setSpacebarHeld(false);
        setMicrophoneMuted(true);
      }
    }, [setMicrophoneMuted, setSpacebarHeld, spacebarHeld])
  );

  return {
    state,
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
