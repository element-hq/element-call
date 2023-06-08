/*
Copyright 2022 New Vector Ltd

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
  GroupCallStatsReportEvent,
  GroupCallStatsReport,
} from "matrix-js-sdk/src/webrtc/groupCall";
import { CallFeed, CallFeedEvent } from "matrix-js-sdk/src/webrtc/callFeed";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { useTranslation } from "react-i18next";
import { IWidgetApiRequest } from "matrix-widget-api";
import { MatrixClient, RoomStateEvent } from "matrix-js-sdk";
import {
  ByteSentStatsReport,
  ConnectionStatsReport,
  SummaryStatsReport,
  CallFeedReport,
} from "matrix-js-sdk/src/webrtc/stats/statsReport";

import { usePageUnload } from "./usePageUnload";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { TranslatedError, translatedError } from "../TranslatedError";
import { ElementWidgetActions, ScreenshareStartData, widget } from "../widget";
import { OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { ElementCallOpenTelemetry } from "../otel/otel";
import { checkForParallelCalls } from "./checkForParallelCalls";

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
  enter: () => Promise<void>;
  leave: () => void;
  toggleLocalVideoMuted: () => void;
  toggleMicrophoneMuted: () => void;
  toggleScreensharing: () => void;
  setMicrophoneMuted: (muted: boolean) => void;
  requestingScreenshare: boolean;
  isScreensharing: boolean;
  screenshareFeeds: CallFeed[];
  localDesktopCapturerSourceId: string; // XXX: This looks unused?
  participants: Map<RoomMember, Map<string, ParticipantInfo>>;
  hasLocalParticipant: boolean;
  unencryptedEventsFromUsers: Set<string>;
  otelGroupCallMembership: OTelGroupCallMembership;
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

// This is a bit of a hack, but we keep the opentelemetry tracker object at the file
// level so that it doesn't pop in & out of existence as react mounts & unmounts
// components. The right solution is probably for this to live in the js-sdk and have
// the same lifetime as groupcalls themselves.
let groupCallOTelMembership: OTelGroupCallMembership;
let groupCallOTelMembershipGroupCallId: string;

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

      let connectionState: ConnectionState;
      // If we allow calls without media, we have no feeds and cannot read the connection status from them.
      // @TODO: The connection state should generally not be determined by the feed.
      if (
        groupCall.allowCallWithoutVideoAndAudio &&
        !feed &&
        !participant.screensharing
      ) {
        connectionState = ConnectionState.Connected;
      } else {
        connectionState = feed
          ? feed.connected
            ? ConnectionState.Connected
            : ConnectionState.WaitMedia
          : ConnectionState.EstablishingCall;
      }
      participantInfoMap.set(deviceId, {
        connectionState,
        presenter: participant.screensharing,
      });
    }
  }

  return participants;
}

export function useGroupCall(
  groupCall: GroupCall,
  client: MatrixClient
): UseGroupCallReturnType {
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

  if (groupCallOTelMembershipGroupCallId !== groupCall.groupCallId) {
    if (groupCallOTelMembership) groupCallOTelMembership.dispose();

    // If the user disables analytics, this will stay around until they leave the call
    // so analytics will be disabled once they leave.
    if (ElementCallOpenTelemetry.instance) {
      groupCallOTelMembership = new OTelGroupCallMembership(groupCall, client);
      groupCallOTelMembershipGroupCallId = groupCall.groupCallId;
    } else {
      groupCallOTelMembership = undefined;
    }
  }

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

  const doNothingMediaActionCallback = useCallback(
    (details: MediaSessionActionDetails) => {},
    []
  );

  const leaveCall = useCallback(() => {
    groupCallOTelMembership?.onLeaveCall();
    groupCall.leave();
  }, [groupCall]);

  useEffect(() => {
    // disable the media action keys, otherwise audio elements get paused when
    // the user presses media keys or unplugs headphones, etc.
    // Note there are actions for muting / unmuting a microphone & hanging up
    // which we could wire up.
    const mediaActions: MediaSessionAction[] = [
      "play",
      "pause",
      "stop",
      "nexttrack",
      "previoustrack",
    ];

    for (const mediaAction of mediaActions) {
      navigator.mediaSession?.setActionHandler(
        mediaAction,
        doNothingMediaActionCallback
      );
    }

    return () => {
      for (const mediaAction of mediaActions) {
        navigator.mediaSession?.setActionHandler(mediaAction, null);
      }
    };
  }, [doNothingMediaActionCallback]);

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

    function onConnectionStatsReport(
      report: GroupCallStatsReport<ConnectionStatsReport>
    ): void {
      groupCallOTelMembership?.onConnectionStatsReport(report);
    }

    function onByteSentStatsReport(
      report: GroupCallStatsReport<ByteSentStatsReport>
    ): void {
      groupCallOTelMembership?.onByteSentStatsReport(report);
    }

    function onSummaryStatsReport(
      report: GroupCallStatsReport<SummaryStatsReport>
    ): void {
      groupCallOTelMembership?.onSummaryStatsReport(report);
    }

    function onCallFeedStatsReport(
      report: GroupCallStatsReport<CallFeedReport>
    ): void {
      groupCallOTelMembership?.onCallFeedStatsReport(report);
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
    groupCall.on(
      GroupCallStatsReportEvent.ConnectionStats,
      onConnectionStatsReport
    );
    groupCall.on(
      GroupCallStatsReportEvent.ByteSentStats,
      onByteSentStatsReport
    );
    groupCall.on(GroupCallStatsReportEvent.SummaryStats, onSummaryStatsReport);
    groupCall.on(
      GroupCallStatsReportEvent.CallFeedStats,
      onCallFeedStatsReport
    );

    groupCall.room.currentState.on(
      RoomStateEvent.Update,
      checkForParallelCalls
    );

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
      groupCall.removeListener(
        GroupCallStatsReportEvent.ConnectionStats,
        onConnectionStatsReport
      );
      groupCall.removeListener(
        GroupCallStatsReportEvent.ByteSentStats,
        onByteSentStatsReport
      );
      groupCall.removeListener(
        GroupCallStatsReportEvent.SummaryStats,
        onSummaryStatsReport
      );
      groupCall.removeListener(
        GroupCallStatsReportEvent.CallFeedStats,
        onCallFeedStatsReport
      );
      groupCall.room.currentState.off(
        RoomStateEvent.Update,
        checkForParallelCalls
      );
      leaveCall();
    };
  }, [groupCall, updateState, leaveCall]);

  usePageUnload(() => {
    leaveCall();
  });

  const initLocalCallFeed = useCallback(
    () => groupCall.initLocalCallFeed(),
    [groupCall]
  );

  const enter = useCallback(async () => {
    if (
      groupCall.state !== GroupCallState.LocalCallFeedUninitialized &&
      groupCall.state !== GroupCallState.LocalCallFeedInitialized
    ) {
      return;
    }

    PosthogAnalytics.instance.eventCallEnded.cacheStartCall(new Date());
    PosthogAnalytics.instance.eventCallStarted.track(groupCall.groupCallId);

    // This must be called before we start trying to join the call, as we need to
    // have started tracking by the time calls start getting created.
    groupCallOTelMembership?.onJoinCall();

    await groupCall.enter().catch((error) => {
      console.error(error);
      updateState({ error });
    });
  }, [groupCall, updateState]);

  const toggleLocalVideoMuted = useCallback(() => {
    const toggleToMute = !groupCall.isLocalVideoMuted();
    groupCall.setLocalVideoMuted(toggleToMute);
    groupCallOTelMembership?.onToggleLocalVideoMuted(toggleToMute);
    // TODO: These explict posthog calls should be unnecessary now with the posthog otel exporter?
    PosthogAnalytics.instance.eventMuteCamera.track(
      toggleToMute,
      groupCall.groupCallId
    );
  }, [groupCall]);

  const setMicrophoneMuted = useCallback(
    (setMuted) => {
      groupCall.setMicrophoneMuted(setMuted);
      groupCallOTelMembership?.onSetMicrophoneMuted(setMuted);
      PosthogAnalytics.instance.eventMuteMicrophone.track(
        setMuted,
        groupCall.groupCallId
      );
    },
    [groupCall]
  );

  const toggleMicrophoneMuted = useCallback(() => {
    const toggleToMute = !groupCall.isMicrophoneMuted();
    groupCallOTelMembership?.onToggleMicrophoneMuted(toggleToMute);
    setMicrophoneMuted(toggleToMute);
  }, [groupCall, setMicrophoneMuted]);

  const toggleScreensharing = useCallback(async () => {
    groupCallOTelMembership?.onToggleScreensharing(!groupCall.isScreensharing);

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
    leave: leaveCall,
    toggleLocalVideoMuted,
    toggleMicrophoneMuted,
    toggleScreensharing,
    setMicrophoneMuted,
    requestingScreenshare,
    isScreensharing,
    screenshareFeeds,
    localDesktopCapturerSourceId,
    participants,
    hasLocalParticipant,
    unencryptedEventsFromUsers,
    otelGroupCallMembership: groupCallOTelMembership,
  };
}
