/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type MatrixClient, JoinRule, type Room } from "matrix-js-sdk";
import {
  Room as LivekitRoom,
  isE2EESupported as isE2EESupportedBrowser,
} from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  MatrixRTCSessionEvent,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import { useNavigate } from "react-router-dom";
import { useObservableEagerState } from "observable-hooks";

import type { IWidgetApiRequest } from "matrix-widget-api";
import {
  ElementWidgetActions,
  type JoinCallData,
  type WidgetHelpers,
} from "../widget";
import { LobbyView } from "./LobbyView";
import { type MatrixInfo } from "./VideoPreview";
import { CallEndedView } from "./CallEndedView";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { useProfile } from "../profile/useProfile";
import { findDeviceByName } from "../utils/media";
import { ActiveCall } from "./InCallView";
import { MUTE_PARTICIPANT_COUNT, type MuteStates } from "./MuteStates";
import { useMediaDevices } from "../livekit/MediaDevicesContext";
import { useMatrixRTCSessionMemberships } from "../useMatrixRTCSessionMemberships";
import { enterRTCSession, leaveRTCSession } from "../rtcSessionHelpers";
import { useRoomEncryptionSystem } from "../e2ee/sharedKeyManagement";
import { useRoomAvatar } from "./useRoomAvatar";
import { useRoomName } from "./useRoomName";
import { useJoinRule } from "./useJoinRule";
import { InviteModal } from "./InviteModal";
import { useUrlParams } from "../UrlParams";
import { E2eeType } from "../e2ee/e2eeType";
import { useAudioContext } from "../useAudioContext";
import { callEventAudioSounds } from "./CallEventAudioRenderer";
import { useLatest } from "../useLatest";
import { usePageTitle } from "../usePageTitle";
import {
  E2EENotSupportedError,
  ElementCallError,
  ErrorCode,
  RTCSessionError,
  UnknownCallError,
} from "../utils/errors.ts";
import { GroupCallErrorBoundary } from "./GroupCallErrorBoundary.tsx";
import {
  useNewMembershipManager as useNewMembershipManagerSetting,
  useExperimentalToDeviceTransport as useExperimentalToDeviceTransportSetting,
  useSetting,
} from "../settings/settings";
import { useTypedEventEmitter } from "../useEvents";
import { muteAllAudio$ } from "../state/MuteAllAudioModel.ts";

declare global {
  interface Window {
    rtcSession?: MatrixRTCSession;
  }
}

interface Props {
  client: MatrixClient;
  isPasswordlessUser: boolean;
  confineToRoom: boolean;
  preload: boolean;
  skipLobby: boolean;
  hideHeader: boolean;
  rtcSession: MatrixRTCSession;
  isJoined: boolean;
  muteStates: MuteStates;
  widget: WidgetHelpers | null;
}

export const GroupCallView: FC<Props> = ({
  client,
  isPasswordlessUser,
  confineToRoom,
  preload,
  skipLobby,
  hideHeader,
  rtcSession,
  isJoined,
  muteStates,
  widget,
}) => {
  // Used to thread through any errors that occur outside the error boundary
  const [externalError, setExternalError] = useState<ElementCallError | null>(
    null,
  );
  const memberships = useMatrixRTCSessionMemberships(rtcSession);

  const muteAllAudio = useObservableEagerState(muteAllAudio$);
  const leaveSoundContext = useLatest(
    useAudioContext({
      sounds: callEventAudioSounds,
      latencyHint: "interactive",
      muted: muteAllAudio,
    }),
  );
  // This should use `useEffectEvent` (only available in experimental versions)
  useEffect(() => {
    if (memberships.length >= MUTE_PARTICIPANT_COUNT)
      muteStates.audio.setEnabled?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logger.info("[Lifecycle] GroupCallView Component mounted");
    return (): void => {
      logger.info("[Lifecycle] GroupCallView Component unmounted");
    };
  }, []);

  useEffect(() => {
    window.rtcSession = rtcSession;
    return (): void => {
      delete window.rtcSession;
    };
  }, [rtcSession]);

  useTypedEventEmitter(
    rtcSession,
    MatrixRTCSessionEvent.MembershipManagerError,
    (error) => {
      setExternalError(
        new RTCSessionError(
          ErrorCode.MEMBERSHIP_MANAGER_UNRECOVERABLE,
          error.message ?? error,
        ),
      );
    },
  );
  useEffect(() => {
    // Sanity check the room object
    if (client.getRoom(rtcSession.room.roomId) !== rtcSession.room)
      logger.warn(
        `We've ended up with multiple rooms for the same ID (${rtcSession.room.roomId}). This indicates a bug in the group call loading code, and may lead to incomplete room state.`,
      );
  }, [client, rtcSession.room]);

  const room = rtcSession.room as Room;
  const { displayName, avatarUrl } = useProfile(client);
  const roomName = useRoomName(room);
  const roomAvatar = useRoomAvatar(room);
  const { perParticipantE2EE, returnToLobby } = useUrlParams();
  const e2eeSystem = useRoomEncryptionSystem(room.roomId);
  const [useNewMembershipManager] = useSetting(useNewMembershipManagerSetting);
  const [useExperimentalToDeviceTransport] = useSetting(
    useExperimentalToDeviceTransportSetting,
  );

  usePageTitle(roomName);

  const matrixInfo = useMemo((): MatrixInfo => {
    return {
      userId: client.getUserId()!,
      displayName: displayName!,
      avatarUrl: avatarUrl!,
      roomId: room.roomId,
      roomName,
      roomAlias: room.getCanonicalAlias(),
      roomAvatar,
      e2eeSystem,
    };
  }, [client, displayName, avatarUrl, roomName, room, roomAvatar, e2eeSystem]);

  // Count each member only once, regardless of how many devices they use
  const participantCount = useMemo(
    () => new Set<string>(memberships.map((m) => m.sender!)).size,
    [memberships],
  );

  const deviceContext = useMediaDevices();
  const latestDevices = useLatest(deviceContext);
  const latestMuteStates = useLatest(muteStates);

  const enterRTCSessionOrError = useCallback(
    async (rtcSession: MatrixRTCSession): Promise<void> => {
      try {
        await enterRTCSession(
          rtcSession,
          perParticipantE2EE,
          useNewMembershipManager,
          useExperimentalToDeviceTransport,
        );
      } catch (e) {
        if (e instanceof ElementCallError) {
          setExternalError(e);
        } else {
          logger.error(`Unknown Error while entering RTC session`, e);
          const error = new UnknownCallError(
            e instanceof Error ? e : new Error("Unknown error", { cause: e }),
          );
          setExternalError(error);
        }
      }
    },
    [
      perParticipantE2EE,
      useExperimentalToDeviceTransport,
      useNewMembershipManager,
    ],
  );

  useEffect(() => {
    const defaultDeviceSetup = async ({
      audioInput,
      videoInput,
    }: JoinCallData): Promise<void> => {
      // XXX: I think this is broken currently - LiveKit *won't* request
      // permissions and give you device names unless you specify a kind, but
      // here we want all kinds of devices. This needs a fix in livekit-client
      // for the following name-matching logic to do anything useful.
      const devices = await LivekitRoom.getLocalDevices(undefined, true);

      if (audioInput) {
        const deviceId = findDeviceByName(audioInput, "audioinput", devices);
        if (!deviceId) {
          logger.warn("Unknown audio input: " + audioInput);
          // override the default mute state
          latestMuteStates.current!.audio.setEnabled?.(false);
        } else {
          logger.debug(
            `Found audio input ID ${deviceId} for name ${audioInput}`,
          );
          latestDevices.current!.audioInput.select(deviceId);
        }
      }

      if (videoInput) {
        const deviceId = findDeviceByName(videoInput, "videoinput", devices);
        if (!deviceId) {
          logger.warn("Unknown video input: " + videoInput);
          // override the default mute state
          latestMuteStates.current!.video.setEnabled?.(false);
        } else {
          logger.debug(
            `Found video input ID ${deviceId} for name ${videoInput}`,
          );
          latestDevices.current!.videoInput.select(deviceId);
        }
      }
    };

    if (skipLobby) {
      if (widget) {
        if (preload) {
          // In preload mode without lobby we wait for a join action before entering
          const onJoin = (ev: CustomEvent<IWidgetApiRequest>): void => {
            (async (): Promise<void> => {
              await defaultDeviceSetup(
                ev.detail.data as unknown as JoinCallData,
              );
              await enterRTCSessionOrError(rtcSession);
              widget.api.transport.reply(ev.detail, {});
            })().catch((e) => {
              logger.error("Error joining RTC session", e);
            });
          };
          widget.lazyActions.on(ElementWidgetActions.JoinCall, onJoin);
          return (): void => {
            widget.lazyActions.off(ElementWidgetActions.JoinCall, onJoin);
          };
        } else {
          // No lobby and no preload: we enter the rtc session right away
          (async (): Promise<void> => {
            await enterRTCSessionOrError(rtcSession);
          })().catch((e) => {
            logger.error("Error joining RTC session", e);
          });
        }
      } else {
        void enterRTCSessionOrError(rtcSession);
      }
    }
  }, [
    widget,
    rtcSession,
    preload,
    skipLobby,
    perParticipantE2EE,
    latestDevices,
    latestMuteStates,
    enterRTCSessionOrError,
    useNewMembershipManager,
  ]);

  const [left, setLeft] = useState(false);

  const navigate = useNavigate();

  const onLeave = useCallback(
    (cause: "user" | "error" = "user"): void => {
      const audioPromise = leaveSoundContext.current?.playSound("left");
      // In embedded/widget mode the iFrame will be killed right after the call ended prohibiting the posthog event from getting sent,
      // therefore we want the event to be sent instantly without getting queued/batched.
      const sendInstantly = !!widget;
      setLeft(true);
      // we need to wait until the callEnded event is tracked on posthog.
      // Otherwise the iFrame gets killed before the callEnded event got tracked.
      const posthogRequest = new Promise((resolve) => {
        PosthogAnalytics.instance.eventCallEnded.track(
          room.roomId,
          rtcSession.memberships.length,
          sendInstantly,
          rtcSession,
        );
        window.setTimeout(resolve, 10);
      });

      leaveRTCSession(
        rtcSession,
        cause,
        // Wait for the sound in widget mode (it's not long)
        Promise.all([audioPromise, posthogRequest]),
      )
        // Only sends matrix leave event. The Livekit session will disconnect once the ActiveCall-view unmounts.
        .then(async () => {
          if (
            !isPasswordlessUser &&
            !confineToRoom &&
            !PosthogAnalytics.instance.isEnabled()
          ) {
            await navigate("/");
          }
        })
        .catch((e) => {
          logger.error("Error leaving RTC session", e);
        });
    },
    [
      leaveSoundContext,
      widget,
      rtcSession,
      room.roomId,
      isPasswordlessUser,
      confineToRoom,
      navigate,
    ],
  );

  useEffect(() => {
    if (widget && isJoined) {
      // set widget to sticky once joined.
      widget.api.setAlwaysOnScreen(true).catch((e) => {
        logger.error("Error calling setAlwaysOnScreen(true)", e);
      });

      const onHangup = (ev: CustomEvent<IWidgetApiRequest>): void => {
        widget.api.transport.reply(ev.detail, {});
        // Only sends matrix leave event. The Livekit session will disconnect once the ActiveCall-view unmounts.
        leaveRTCSession(rtcSession, "user").catch((e) => {
          logger.error("Failed to leave RTC session", e);
        });
      };
      widget.lazyActions.once(ElementWidgetActions.HangupCall, onHangup);
      return (): void => {
        widget.lazyActions.off(ElementWidgetActions.HangupCall, onHangup);
      };
    }
  }, [widget, isJoined, rtcSession]);

  const joinRule = useJoinRule(room);

  const [shareModalOpen, setInviteModalOpen] = useState(false);
  const onDismissInviteModal = useCallback(
    () => setInviteModalOpen(false),
    [setInviteModalOpen],
  );

  const onShareClickFn = useCallback(
    () => setInviteModalOpen(true),
    [setInviteModalOpen],
  );
  const onShareClick = joinRule === JoinRule.Public ? onShareClickFn : null;

  if (!isE2EESupportedBrowser() && e2eeSystem.kind !== E2eeType.NONE) {
    // If we have a encryption system but the browser does not support it.
    throw new E2EENotSupportedError();
  }

  const shareModal = (
    <InviteModal
      room={room}
      open={shareModalOpen}
      onDismiss={onDismissInviteModal}
    />
  );
  const lobbyView = (
    <>
      {shareModal}
      <LobbyView
        client={client}
        matrixInfo={matrixInfo}
        muteStates={muteStates}
        onEnter={() => void enterRTCSessionOrError(rtcSession)}
        confineToRoom={confineToRoom}
        hideHeader={hideHeader}
        participantCount={participantCount}
        onShareClick={onShareClick}
      />
    </>
  );

  let body: ReactNode;
  if (externalError) {
    // If an error was recorded within this component but outside
    // GroupCallErrorBoundary, create a component that rethrows the error from
    // within the error boundary, so it can be handled uniformly
    const ErrorComponent = (): ReactNode => {
      throw externalError;
    };
    body = <ErrorComponent />;
  } else if (isJoined) {
    body = (
      <>
        {shareModal}
        <ActiveCall
          client={client}
          matrixInfo={matrixInfo}
          rtcSession={rtcSession as MatrixRTCSession}
          participantCount={participantCount}
          onLeave={onLeave}
          hideHeader={hideHeader}
          muteStates={muteStates}
          e2eeSystem={e2eeSystem}
          //otelGroupCallMembership={otelGroupCallMembership}
          onShareClick={onShareClick}
        />
      </>
    );
  } else if (left && widget === null) {
    // Left in SPA mode:

    // The call ended view is shown for two reasons: prompting guests to create
    // an account, and prompting users that have opted into analytics to provide
    // feedback. We don't show a feedback prompt to widget users however (at
    // least for now), because we don't yet have designs that would allow widget
    // users to dismiss the feedback prompt and close the call window without
    // submitting anything.
    if (
      isPasswordlessUser ||
      (PosthogAnalytics.instance.isEnabled() && widget === null)
    ) {
      body = (
        <CallEndedView
          endedCallId={rtcSession.room.roomId}
          client={client}
          isPasswordlessUser={isPasswordlessUser}
          confineToRoom={confineToRoom}
        />
      );
    } else {
      // If the user is a regular user, we'll have sent them back to the homepage,
      // so just sit here & do nothing: otherwise we would (briefly) mount the
      // LobbyView again which would open capture devices again.
      body = null;
    }
  } else if (left && widget !== null) {
    // Left in widget mode:
    body = returnToLobby ? lobbyView : null;
  } else if (preload || skipLobby) {
    body = null;
  } else {
    body = lobbyView;
  }

  return (
    <GroupCallErrorBoundary
      widget={widget}
      recoveryActionHandler={(action) => {
        if (action == "reconnect") {
          setLeft(false);
          enterRTCSessionOrError(rtcSession).catch((e) => {
            logger.error("Error re-entering RTC session", e);
          });
        }
      }}
      onError={
        (/**error*/) => {
          if (rtcSession.isJoined()) onLeave("error");
        }
      }
    >
      {body}
    </GroupCallErrorBoundary>
  );
};
