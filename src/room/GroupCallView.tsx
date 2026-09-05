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
import {
  type MatrixClient,
  JoinRule,
  type Room,
  UnsupportedStickyEventsEndpointError,
} from "matrix-js-sdk";
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

import { type JoinCallData } from "../widget";
import { LobbyView } from "./LobbyView";
import { type MatrixInfo } from "./VideoPreview";
import { CallEndedView } from "./CallEndedView";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { useProfile } from "../profile/useProfile";
import { findDeviceByName } from "../utils/media";
import { ActiveCall } from "./InCallView";
import { type MuteStates } from "../state/MuteStates";
import { useMediaDevices } from "../MediaDevicesContext";
import { useMatrixRTCSessionMemberships } from "../useMatrixRTCSessionMemberships";
import {
  saveKeyForRoom,
  useRoomEncryptionSystem,
} from "../e2ee/sharedKeyManagement";
import { useRoomAvatar } from "./useRoomAvatar";
import { useRoomName } from "./useRoomName";
import { useJoinRule } from "./useJoinRule";
import { InviteModal } from "./InviteModal";
import { HeaderStyle, type UrlParams, useUrlParams } from "../UrlParams";
import { E2eeType } from "../e2ee/e2eeType";
import { useAudioContext } from "../useAudioContext";
import {
  callEventAudioSounds,
  type CallEventSounds,
} from "./CallEventAudioRenderer";
import { useLatest } from "../useLatest";
import { usePageTitle } from "../usePageTitle";
import {
  ConnectionLostError,
  E2EENotSupportedError,
  ElementCallError,
  StickyEventsRequiredError,
  UnknownCallError,
} from "../utils/errors.ts";
import { GroupCallErrorBoundary } from "./GroupCallErrorBoundary.tsx";
import { useTypedEventEmitter } from "../useEvents";
import { muteAllAudio$ } from "../state/MuteAllAudioModel.ts";
import { useAppBarTitle } from "../AppBar.tsx";
import { useBehavior } from "../useBehavior.ts";
import { useRootElement } from "../RootElementContext.ts";
import { useHostBridge } from "../HostBridge.ts";

/**
 * If there already are this many participants in the call, we automatically mute
 * the user.
 */
export const MUTE_PARTICIPANT_COUNT = 8;

declare global {
  interface Window {
    rtcSession?: MatrixRTCSession;
  }
}

interface Props {
  client: MatrixClient;
  isPasswordlessUser: boolean;
  confineToRoom: boolean;
  preload: UrlParams["preload"];
  skipLobby: UrlParams["skipLobby"];
  rtcSession: MatrixRTCSession;
  joined: boolean;
  setJoined: (value: boolean) => void;
  muteStates: MuteStates;
}

export const GroupCallView: FC<Props> = ({
  client,
  isPasswordlessUser,
  confineToRoom,
  preload,
  skipLobby,
  rtcSession,
  joined,
  setJoined,
  muteStates,
}) => {
  // Used to thread through any errors that occur outside the error boundary
  const [externalError, setExternalError] = useState<ElementCallError | null>(
    null,
  );
  const memberships = useMatrixRTCSessionMemberships(rtcSession);
  const rootElement = useRootElement();
  const hostBridge = useHostBridge();
  // A host that can close us is a host that decides when we stop existing, so
  // we neither show our own post-call screens nor assume we have time to
  // finish what we are doing.
  // TODO: this reads a capability as a proxy for who owns our lifetime. Worth
  // finding a more direct way to express it — see the guidance in UrlParams.ts
  // on naming behaviours rather than situations.
  const hostControlsLifetime = hostBridge.close !== undefined;

  const muteAllAudio = useBehavior(muteAllAudio$);
  const leaveSoundContext = useLatest(
    useAudioContext<CallEventSounds>({
      sounds: callEventAudioSounds,
      latencyHint: "interactive",
      muted: muteAllAudio,
    }),
  );
  // This should use `useEffectEvent` (only available in experimental versions)
  useEffect(() => {
    if (memberships.length >= MUTE_PARTICIPANT_COUNT)
      muteStates.audio.setEnabled$.value?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logger.info("[Lifecycle] GroupCallView Component mounted");
    return (): void => {
      logger.info("[Lifecycle] GroupCallView Component unmounted");
    };
  }, []);

  // This CSS is the only way we could find to not make element call scroll for
  // viewport sizes smaller than 122px width. (It is actually this exact number: 122px
  // tested on different devices...)
  useEffect(() => {
    rootElement.classList.add("no-scroll-body");
    return (): void => {
      rootElement.classList.remove("no-scroll-body");
    };
  }, [rootElement]);

  useEffect(() => {
    window.rtcSession = rtcSession;
    return (): void => {
      delete window.rtcSession;
    };
  }, [rtcSession]);

  // TODO move this into the callViewModel LocalMembership.ts
  // We might actually not need this at all. Since we get into fatalError on those errors already?
  useTypedEventEmitter(
    rtcSession,
    MatrixRTCSessionEvent.MembershipManagerError,
    (error) => {
      // When matrix_rtc_mode=matrix_2_0 is in effect but the homeserver does
      // not advertise MSC4354 (sticky events), the SDK throws an
      // `UnsupportedStickyEventsEndpointError`. The MembershipManager
      // scheduler wraps it and exposes the original via `.cause`.
      if (
        error instanceof Error &&
        error.cause instanceof UnsupportedStickyEventsEndpointError
      ) {
        setExternalError(new StickyEventsRequiredError());
      } else {
        setExternalError(new ConnectionLostError());
      }
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
  const {
    perParticipantE2EE,
    returnToLobby,
    password: passwordFromUrl,
    header,
  } = useUrlParams();
  const e2eeSystem = useRoomEncryptionSystem(room.roomId);

  // Save the password once we start the groupCallView
  useEffect(() => {
    if (passwordFromUrl) saveKeyForRoom(room.roomId, passwordFromUrl);
  }, [passwordFromUrl, room.roomId]);

  usePageTitle(roomName);
  useAppBarTitle(roomName);

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
    () => new Set<string>(memberships.map((m) => m.userId!)).size,
    [memberships],
  );

  const mediaDevices = useMediaDevices();
  const latestMuteStates = useLatest(muteStates);

  const enterRTCSessionOrError = useCallback(
    async (rtcSession: MatrixRTCSession): Promise<void> => {
      try {
        setJoined(true);
        // TODO-MULTI-SFU what to do with error handling now that we don't use this function?
        // @BillCarsonFr
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
      return Promise.resolve();
    },
    [setJoined],
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
          latestMuteStates.current!.audio.setEnabled$.value?.(false);
        } else {
          logger.debug(
            `Found audio input ID ${deviceId} for name ${audioInput}`,
          );
          mediaDevices.audioInput.select(deviceId);
        }
      }

      if (videoInput) {
        const deviceId = findDeviceByName(videoInput, "videoinput", devices);
        if (!deviceId) {
          logger.warn("Unknown video input: " + videoInput);
          // override the default mute state
          latestMuteStates.current!.video.setEnabled$.value?.(false);
        } else {
          logger.debug(
            `Found video input ID ${deviceId} for name ${videoInput}`,
          );
          mediaDevices.videoInput.select(deviceId);
        }
      }
    };

    if (skipLobby) {
      // `preload` is only ever set when we have a host to be preloaded by.
      if (preload) {
        // In preload mode without lobby we wait for a join action before entering
        const subscription = hostBridge.join$.subscribe(({ data, reply }) => {
          (async (): Promise<void> => {
            await defaultDeviceSetup(data);
            setJoined(true);
            reply();
          })().catch((e) => {
            logger.error("Error joining RTC session on preload", e);
          });
        });
        return (): void => subscription.unsubscribe();
      } else {
        // No lobby and no preload: we enter the rtc session right away
        setJoined(true);
      }
    }
  }, [
    hostBridge,
    rtcSession,
    preload,
    skipLobby,
    perParticipantE2EE,
    mediaDevices,
    latestMuteStates,
    setJoined,
  ]);

  // TODO refactor this + "joined" to just one callState
  const [left, setLeft] = useState(false);

  const navigate = useNavigate();

  // TODO split this into leave and onDisconnect
  const onLeft = useCallback(
    (
      reason: "timeout" | "user" | "allOthersLeft" | "decline" | "error",
    ): void => {
      let audioPromise: Promise<void> | undefined = undefined;
      switch (reason) {
        case "allOthersLeft":
          // When "allOthersLeft", the leaveSoundEffect$ in CallEventAudioRenderer
          // already plays the "left" sound when the remote participant's media
          // disappears. We play it here silenced (volumeOverwrite = 0) so we have the right duration in the audioPromise.
          // (which is what delays asking the host to close us)
          audioPromise = leaveSoundContext.current?.playSound("left", 0);
          break;
        case "timeout":
        case "decline":
          audioPromise = leaveSoundContext.current?.playSound(reason);
          break;
        default:
          audioPromise = leaveSoundContext.current?.playSound("left");
      }

      setJoined(false);
      setLeft(true);

      // We need to wait until the callEnded event is tracked on PostHog,
      // otherwise we may be torn down first.
      const posthogRequest = new Promise((resolve) => {
        // To increase the likelihood of the PostHog event being sent out
        // before the host disposes of us, we ask it to skip the usual
        // queuing/batching of requests.
        const sendInstantly = hostControlsLifetime;
        PosthogAnalytics.instance.eventCallEnded.track(
          room.roomId,
          rtcSession.memberships.length,
          sendInstantly,
          rtcSession,
        );
        // Unfortunately the PostHog library provides no way to await the
        // tracking of an event, but we don't really want it to hold up our
        // disposal that long anyway, so giving it 10 ms will do.
        window.setTimeout(resolve, 10);
      });

      void Promise.all([audioPromise, posthogRequest])
        .catch((e) =>
          logger.error(
            "Failed to play leave audio and/or send PostHog leave event",
            e,
          ),
        )
        .then(async () => {
          if (
            !isPasswordlessUser &&
            !confineToRoom &&
            !PosthogAnalytics.instance.isEnabled()
          )
            void navigate("/");

          // After this point the host could dispose of us at any moment!
          try {
            await hostBridge.setAlwaysOnScreen(false);
          } catch (e) {
            logger.error("Failed to set `alwaysOnScreen` to false", e);
          }
          // On a normal user hangup we can shut down and ask to be closed. But
          // if an error occurs we should stay open until the user reads it.
          if (reason != "error" && !returnToLobby) {
            try {
              await hostBridge.close?.();
            } catch (e) {
              logger.error("Failed to ask the host to close Element Call", e);
            }
          }
        });
    },
    [
      setJoined,
      leaveSoundContext,
      hostBridge,
      hostControlsLifetime,
      room.roomId,
      rtcSession,
      isPasswordlessUser,
      confineToRoom,
      returnToLobby,
      navigate,
    ],
  );

  useEffect(() => {
    if (joined)
      // ask to be kept on screen once joined.
      hostBridge.setAlwaysOnScreen(true).catch((e) => {
        logger.error("Error calling setAlwaysOnScreen(true)", e);
      });
  }, [hostBridge, joined, rtcSession]);

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
        onEnter={() => setJoined(true)}
        confineToRoom={confineToRoom}
        hideHeader={header !== HeaderStyle.Standard}
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
  } else if (joined) {
    body = (
      <>
        {shareModal}
        <ActiveCall
          client={client}
          matrixInfo={matrixInfo}
          rtcSession={rtcSession as MatrixRTCSession}
          matrixRoom={room}
          onLeft={onLeft}
          muteStates={muteStates}
          e2eeSystem={e2eeSystem}
          //otelGroupCallMembership={otelGroupCallMembership}
          onShareClick={onShareClick}
        />
      </>
    );
  } else if (left && !hostControlsLifetime) {
    // Left, and it is up to us what to show next:

    // The call ended view is shown for two reasons: prompting guests to create
    // an account, and prompting users that have opted into analytics to provide
    // feedback. We don't show a feedback prompt when a host owns our lifetime
    // however (at least for now), because we don't yet have designs that would
    // allow those users to dismiss the feedback prompt and close the call
    // window without submitting anything.
    if (isPasswordlessUser || PosthogAnalytics.instance.isEnabled()) {
      body = (
        <CallEndedView
          endedCallId={rtcSession.room.roomId}
          client={client}
          isPasswordlessUser={isPasswordlessUser}
          hideHeader={header === HeaderStyle.None}
          confineToRoom={confineToRoom}
        />
      );
    } else {
      // If the user is a regular user, we'll have sent them back to the homepage,
      // so just sit here & do nothing: otherwise we would (briefly) mount the
      // LobbyView again which would open capture devices again.
      body = null;
    }
  } else if (left && hostControlsLifetime) {
    // Left, and the host decides what happens next:
    body = returnToLobby ? lobbyView : null;
  } else if (preload || skipLobby) {
    // The RTC session is not joined to yet (`isJoined`), but enterRTCSessionOrError should have been called.
    body = null;
  } else {
    body = lobbyView;
  }

  return (
    <GroupCallErrorBoundary
      recoveryActionHandler={async (action) => {
        setExternalError(null);
        if (action == "reconnect") {
          setLeft(false);
          await enterRTCSessionOrError(rtcSession).catch((e) => {
            logger.error("Error re-entering RTC session", e);
          });
        }
      }}
      onError={(_error) => {
        if (rtcSession.isJoined()) onLeft("error");
        // If there is an error we need to be dismissible again. This is done in
        // `onLeft` as well; we need it here explicitly in case
        // rtcSession.isJoined is false.
        void hostBridge.setAlwaysOnScreen(false);
      }}
    >
      {body}
    </GroupCallErrorBoundary>
  );
};
