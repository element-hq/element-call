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
  type MatrixRTCSession,
  type Statistics,
} from "matrix-js-sdk/lib/matrixrtc";
import { type Observable } from "rxjs";
import {
  createRTCSlot,
  type EncryptionSystem,
  MembershipManagerError as RTCMembershipManagerError,
  type RTCSlot,
  withEmitter,
} from "@element-hq/matrixrtc-sdk";

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
import {
  E2EENotSupportedError,
  ElementCallError,
  UnknownCallError,
} from "../utils/errors.ts";
import { GroupCallErrorBoundary } from "./GroupCallErrorBoundary.tsx";
import { muteAllAudio$ } from "../state/MuteAllAudioModel.ts";
import { useAppBarTitle } from "../AppBar.tsx";
import { useBehavior } from "../useBehavior.ts";
import { useRootElement } from "../RootElementContext.ts";
import { useHostBridge } from "../HostBridge.ts";
import { useMuteStates } from "../state/useMuteStates.ts";
import { useLeaveToHome } from "../LeaveToHomeContext.ts";
import { useLocalMedia } from "../useLocalMedia.ts";
import { ObservableScope } from "../state/ObservableScope.ts";
import { type CallNotificationWrapper } from "../state/CallViewModel/CallNotificationLifecycle.ts";
import { type CallMatrixBackend } from "../CallMatrixBackend.ts";

/**
 * If there already are this many participants in the call, we automatically mute
 * the user.
 */
export const MUTE_PARTICIPANT_COUNT = 8;

interface Props {
  /** The client and room to place the call with and in. */
  backend: CallMatrixBackend;
  /**
   * The call to join, which the RTC slot is built on.
   * Passing undefined -> the SDK will create a inner RTCSession (or in the future a rust equivalent)
   * @deprecated: It should not get its rtcSession from here.
   * The goal is that the RTC session is fully encapsulated inside the SDK (`createRTCSlot`)
   * We keep this as a fallback for the SPA. In that mode we currently expect to manage Our
   * own rtcSession with `useLoadGroupCall`. This is an open TODO. Until then we have this
   * alternative.
   */
  rtcSession?: MatrixRTCSession;
  /**
   * Whether the user is signed in as a guest, and so should be offered the
   * chance to create an account when the call ends.
   */
  isPasswordlessUser: boolean;
  /** Whether to keep the user in this call rather than letting them navigate. */
  confineToRoom: boolean;
  /** Whether to wait for the host to ask us to join. */
  preload: UrlParams["preload"];
  /** Whether to enter the call directly, without showing the lobby first. */
  skipLobby: UrlParams["skipLobby"];
}

/**
 * A call, from start to finish.
 *
 * This owns the whole lifecycle of being in a call: the lobby, where the user
 * checks their camera and microphone before joining; the call itself; and the
 * screen shown once it has ended. Not every call has every stage — the lobby
 * is skipped when the user is put straight into the call, or when the host
 * wants to say when to join; and after the call there may be a post-call
 * screen, a return to the lobby, or nothing, depending on whether the host
 * decides what comes next. The view decides which stages apply from the
 * parameters it was started with and from what the host bridge says.
 *
 * It owns nothing about how Element Call came to be showing a call: no
 * routing, no authentication, no resolving of room aliases. Those belong to
 * whatever is hosting it — the standalone app's own shell, or an application
 * embedding Element Call as a component. Both render this.
 */
export const CallView: FC<Props> = ({
  backend,
  rtcSession: externalRtcSession,
  ...props
}): ReactNode => {
  // STOP GAP: what is below is still written against a client and a room.
  // Both are refactored along with the backend.
  const client = useMemo(
    () => withEmitter(backend, backend.clientEmitter),
    [backend],
  );
  const room = useMemo(
    () => withEmitter(backend, backend.roomEmitter),
    [backend],
  );

  // Whether the user is in the call is the call's own business, not its host's.
  // Held here rather than below so that it survives the mute state being
  // rebuilt.
  const [joined, setJoined] = useState(false);
  const muteStates = useMuteStates();
  const e2eeSystem = useRoomEncryptionSystem(backend.roomId);

  // One slot for every join of this call: leaving and joining again, to
  // reconnect or from the lobby, happens on the same one
  const [slot, setSlot] = useState<ReturnType<typeof createRTCSlot> | null>(
    null,
  );
  useEffect(() => {
    const scope = new ObservableScope();
    setSlot(
      createRTCSlot(
        scope,
        backend,
        { encryptionSystem: e2eeSystem },
        externalRtcSession,
      ),
    );
    return (): void => scope.end();
  }, [backend, e2eeSystem, externalRtcSession]);

  if (muteStates === null || slot === null) return null;

  return (
    <LoadedCallView
      {...props}
      client={client}
      room={room}
      sentCallNotification$={slot.sentCallNotification$}
      statistics={slot.statistics}
      slot={slot}
      e2eeSystem={e2eeSystem}
      joined={joined}
      setJoined={setJoined}
      muteStates={muteStates}
    />
  );
};

// Here we do not pass the rtcSession anymore. This is a huge step!!
// We only rely on our sdk abstraction (+ client and +room but only a
// smaller list of callbacks.)
interface LoadedProps extends Omit<Props, "rtcSession" | "backend"> {
  // Narrower than `Props.client`: the `slot` already has what only it and its
  // session need, `getRTCTransports`, `delegateDelayedLeave`, `baseUrl`,
  // `getSyncState`, `ClientEvent.Sync`, and the session's sending
  client: Pick<
    MatrixClient,
    | "getUserId"
    | "getDeviceId"
    | "getDomain"
    | "getOpenIdToken"
    | "getLivekitToken"
    | "sendEvent"
    | "redactEvent"
    | "decryptEventIfNeeded"
    | "getUser"
    | "setDisplayName"
    | "setAvatarUrl"
    | "uploadContent"
    | "doesServerSupportUnstableFeature"
    | "getCrypto"
    // `on`/`off`, to listen for `MatrixEventEvent.Decrypted` (reactions once
    // decrypted)
    | "on"
    | "off"
  >;
  // Narrower than `Props.room`: the `slot` already follows
  // `RoomStateEvent.Events` for its status, `RoomStateEvent.Members` for its
  // own members, and the timeline its session reads the memberships from
  room: Pick<
    Room,
    | "roomId"
    | "name"
    | "getMxcAvatarUrl"
    | "getJoinRule"
    | "getMembersWithMembership"
    | "_unstable_getStickyEvents"
    | "getLiveTimeline"
    | "relations"
    // `on`/`off`, to listen for:
    // - `RoomEvent.Name` (room name)
    // - `RoomStateEvent.Update` and `RoomEvent.CurrentStateUpdated` (avatar
    //   and join rule hooks)
    // - `RoomStateEvent.Members` (call view model members)
    // - `RoomStateEvent.Events` (call view model functional members)
    // - `RoomEvent.Timeline` and `RoomStickyEventsEvent.Update` (call notifications)
    // - `RoomEvent.Timeline`, `RoomEvent.Redaction` and
    //   `RoomEvent.LocalEchoUpdated` (reactions and raised hands)
    | "on"
    | "off"
  >;
  /**
   * The call notifications the session sends with our join, so the call can
   * show it ringing: the slot's `sentCallNotification$`.
   */
  sentCallNotification$: Observable<CallNotificationWrapper>;
  /** The session's media key statistics, reported when the call ends. */
  statistics: Statistics;
  slot: RTCSlot;
  e2eeSystem: EncryptionSystem;
  joined: boolean;
  setJoined: (value: boolean) => void;
  muteStates: MuteStates;
}

/**
 * Whether our membership is live in the slot: seen in the room, and not taken
 * down by the membership manager stopping. Leaving the call only makes sense
 * then; an error before the join, or one that ended the membership, leaves
 * nothing to leave.
 */
function isInCall(slot: RTCSlot): boolean {
  const participation = slot.participation$.value;
  if (participation?.localMember$.value == null) return false;
  const state = participation.state$.value;
  return !(
    state.kind === "failed" && state.error instanceof RTCMembershipManagerError
  );
}

/** {@link CallView}, once it has the slot and mute state everything below needs. */
const LoadedCallView: FC<LoadedProps> = ({
  client,
  room,
  isPasswordlessUser,
  confineToRoom,
  preload,
  skipLobby,
  slot,
  sentCallNotification$,
  statistics,
  e2eeSystem,
  joined,
  setJoined,
  muteStates,
}) => {
  // Used to thread through any errors that occur outside the error boundary
  const [externalError, setExternalError] = useState<ElementCallError | null>(
    null,
  );
  const members = useBehavior(slot.members$);
  const rootElement = useRootElement();
  const hostBridge = useHostBridge();
  // A host that can close us is a host that decides when we stop existing, so
  // we neither show our own post-call screens nor assume we have time to
  // finish what we are doing. (Whose account the user's is, by contrast, is
  // stated outright: see `HostBridge.supportsProfileChanges`.)
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
    if (members.length >= MUTE_PARTICIPANT_COUNT)
      muteStates.audio.setEnabled$.value?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logger.info("[Lifecycle] CallView Component mounted");
    return (): void => {
      logger.info("[Lifecycle] CallView Component unmounted");
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

  const { displayName, avatarUrl } = useProfile(client);
  const roomName = useRoomName(room);
  const roomAvatar = useRoomAvatar(room);
  const { returnToLobby, password: passwordFromUrl, header } = useUrlParams();

  // Save the password once we start the groupCallView
  useEffect(() => {
    if (passwordFromUrl) saveKeyForRoom(room.roomId, passwordFromUrl);
  }, [passwordFromUrl, room.roomId]);

  useAppBarTitle(roomName);

  const matrixInfo = useMemo((): MatrixInfo => {
    return {
      userId: client.getUserId()!,
      displayName: displayName!,
      avatarUrl: avatarUrl!,
      roomId: room.roomId,
      roomName,
      roomAvatar,
      e2eeSystem,
    };
  }, [client, displayName, avatarUrl, roomName, room, roomAvatar, e2eeSystem]);

  // Count each member only once, regardless of how many devices they use
  const participantCount = useMemo(
    () => new Set<string>(members.map((m) => m.userId)).size,
    [members],
  );

  const mediaDevices = useMediaDevices();
  const latestMuteStates = useLatest(muteStates);
  // Opened by the lobby, published by the call: one capture for both
  const media = useLocalMedia();

  const enterRTCSessionOrError = useCallback(async (): Promise<void> => {
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
  }, [setJoined]);

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
    preload,
    skipLobby,
    mediaDevices,
    latestMuteStates,
    setJoined,
  ]);

  // TODO refactor this + "joined" to just one callState
  const [left, setLeft] = useState(false);

  const leaveToHome = useLeaveToHome();

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
          slot.members$.value.length,
          sendInstantly,
          statistics,
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
            leaveToHome?.();

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
      slot,
      statistics,
      isPasswordlessUser,
      confineToRoom,
      returnToLobby,
      leaveToHome,
    ],
  );

  useEffect(() => {
    if (joined)
      // ask to be kept on screen once joined.
      hostBridge.setAlwaysOnScreen(true).catch((e) => {
        logger.error("Error calling setAlwaysOnScreen(true)", e);
      });
  }, [hostBridge, joined]);

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
        media={media}
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
          slot={slot}
          sentCallNotification$={sentCallNotification$}
          matrixRoom={room}
          onLeft={onLeft}
          media={media}
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
          endedCallId={room.roomId}
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
    // Not in the call yet: waiting for the host to say when, or about to join
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
          await enterRTCSessionOrError().catch((e) => {
            logger.error("Error re-entering RTC session", e);
          });
        }
      }}
      onError={(_error) => {
        if (isInCall(slot)) onLeft("error");
        // If there is an error we need to be dismissible again. This is done in
        // `onLeft` as well; we need it here explicitly in case we were not in
        // the call.
        void hostBridge.setAlwaysOnScreen(false);
      }}
    >
      {body}
    </GroupCallErrorBoundary>
  );
};
