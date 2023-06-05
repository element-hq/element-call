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

import { ResizeObserver } from "@juggle/resize-observer";
import {
  useLiveKitRoom,
  useLocalParticipant,
  useParticipants,
  useToken,
  useTracks,
} from "@livekit/components-react";
import { usePreventScroll } from "@react-aria/overlays";
import classNames from "classnames";
import { Room, Track } from "livekit-client";
import { JoinRule } from "matrix-js-sdk/src/@types/partials";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import useMeasure from "react-use-measure";

import type { IWidgetApiRequest } from "matrix-widget-api";
import { Avatar } from "../Avatar";
import {
  Header,
  LeftNav,
  RightNav,
  RoomHeaderInfo,
  VersionMismatchWarning,
} from "../Header";
import { useModalTriggerState } from "../Modal";
import { PosthogAnalytics } from "../PosthogAnalytics";
import { useUrlParams } from "../UrlParams";
import { UserMenuContainer } from "../UserMenuContainer";
import {
  HangupButton,
  MicButton,
  ScreenshareButton,
  VideoButton,
} from "../button";
import { MediaDevicesState } from "../settings/mediaDevices";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { useShowInspector } from "../settings/useSetting";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import {
  TileDescriptor,
  VideoGrid,
  useVideoGridLayout,
} from "../video-grid/VideoGrid";
import { ItemData, VideoTileContainer } from "../video-grid/VideoTileContainer";
import { ElementWidgetActions, widget } from "../widget";
import { GridLayoutMenu } from "./GridLayoutMenu";
import { GroupCallInspector } from "./GroupCallInspector";
import styles from "./InCallView.module.css";
import { OverflowMenu } from "./OverflowMenu";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { MatrixInfo } from "./VideoPreview";
import { useJoinRule } from "./useJoinRule";
import { ParticipantInfo } from "./useGroupCall";

const canScreenshare = "getDisplayMedia" in (navigator.mediaDevices ?? {});
// There is currently a bug in Safari our our code with cloning and sending MediaStreams
// or with getUsermedia and getDisplaymedia being used within the same session.
// For now we can disable screensharing in Safari.
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

interface Props {
  client: MatrixClient;
  groupCall: GroupCall;
  participants: Map<RoomMember, Map<string, ParticipantInfo>>;
  onLeave: () => void;
  unencryptedEventsFromUsers: Set<string>;
  hideHeader: boolean;

  matrixInfo: MatrixInfo;
  mediaDevices: MediaDevicesState;
  livekitRoom: Room;
}

export function InCallView({
  client,
  groupCall,
  participants,
  onLeave,
  unencryptedEventsFromUsers,
  hideHeader,
  matrixInfo,
  mediaDevices,
  livekitRoom,
}: Props) {
  const { t } = useTranslation();
  usePreventScroll();
  const joinRule = useJoinRule(groupCall.room);

  const containerRef1 = useRef<HTMLDivElement | null>(null);
  const [containerRef2, bounds] = useMeasure({ polyfill: ResizeObserver });
  const boundsValid = bounds.height > 0;
  // Merge the refs so they can attach to the same element
  const containerRef = useCallback(
    (el: HTMLDivElement) => {
      containerRef1.current = el;
      containerRef2(el);
    },
    [containerRef1, containerRef2]
  );

  const userId = client.getUserId();
  const deviceId = client.getDeviceId();
  const options = useMemo(
    () => ({
      userInfo: {
        name: matrixInfo.userName,
        identity: `${userId}:${deviceId}`,
      },
    }),
    [matrixInfo.userName, userId, deviceId]
  );
  const token = useToken(
    "http://localhost:8080/token",
    matrixInfo.roomName,
    options
  );

  // Uses a hook to connect to the LiveKit room (on unmount the room will be left) and publish local media tracks (default).
  useLiveKitRoom({
    token,
    serverUrl: "ws://localhost:7880",
    room: livekitRoom,
    audio: true,
    video: true,
    onConnected: () => {
      console.log("connected to LiveKit room");
    },
    onDisconnected: () => {
      console.log("disconnected from LiveKit room");
    },
    onError: (err) => {
      console.error("error connecting to LiveKit room", err);
    },
  });

  const screenSharingTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    {
      room: livekitRoom,
    }
  );
  const { layout, setLayout } = useVideoGridLayout(
    screenSharingTracks.length > 0
  );

  const [showInspector] = useShowInspector();

  const { modalState: feedbackModalState, modalProps: feedbackModalProps } =
    useModalTriggerState();

  const { hideScreensharing } = useUrlParams();

  const {
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    localParticipant,
  } = useLocalParticipant({ room: livekitRoom });

  const toggleMicrophone = useCallback(async () => {
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [localParticipant, isMicrophoneEnabled]);
  const toggleCamera = useCallback(async () => {
    await localParticipant.setCameraEnabled(!isCameraEnabled);
  }, [localParticipant, isCameraEnabled]);
  const toggleScreenSharing = useCallback(async () => {
    await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
  }, [localParticipant, isScreenShareEnabled]);

  useCallViewKeyboardShortcuts(
    !feedbackModalState.isOpen,
    toggleMicrophone,
    toggleCamera,
    async (muted) => await localParticipant.setMicrophoneEnabled(!muted)
  );

  useEffect(() => {
    widget?.api.transport.send(
      layout === "freedom"
        ? ElementWidgetActions.TileLayout
        : ElementWidgetActions.SpotlightLayout,
      {}
    );
  }, [layout]);

  useEffect(() => {
    if (widget) {
      const onTileLayout = async (ev: CustomEvent<IWidgetApiRequest>) => {
        setLayout("freedom");
        await widget.api.transport.reply(ev.detail, {});
      };
      const onSpotlightLayout = async (ev: CustomEvent<IWidgetApiRequest>) => {
        setLayout("spotlight");
        await widget.api.transport.reply(ev.detail, {});
      };

      widget.lazyActions.on(ElementWidgetActions.TileLayout, onTileLayout);
      widget.lazyActions.on(
        ElementWidgetActions.SpotlightLayout,
        onSpotlightLayout
      );

      return () => {
        widget.lazyActions.off(ElementWidgetActions.TileLayout, onTileLayout);
        widget.lazyActions.off(
          ElementWidgetActions.SpotlightLayout,
          onSpotlightLayout
        );
      };
    }
  }, [setLayout]);

  const reducedControls = boundsValid && bounds.width <= 400;
  const noControls = reducedControls && bounds.height <= 400;

  const items = useParticipantTiles(livekitRoom, participants, {
    userId: client.getUserId()!,
    deviceId: client.getDeviceId()!,
  });

  // The maximised participant: the focused (active) participant if the
  // window is too small to show everyone.
  const maximisedParticipant = useMemo(
    () => (noControls ? items.find((item) => item.focused) ?? null : null),
    [noControls, items]
  );

  const renderAvatar = useCallback(
    (roomMember: RoomMember, width: number, height: number) => {
      const avatarUrl = roomMember.getMxcAvatarUrl();
      const size = Math.round(Math.min(width, height) / 2);

      return (
        <Avatar
          key={roomMember.userId}
          size={size}
          src={avatarUrl ?? undefined}
          fallback={roomMember.name.slice(0, 1).toUpperCase()}
          className={styles.avatar}
        />
      );
    },
    []
  );

  const prefersReducedMotion = usePrefersReducedMotion();

  const renderContent = (): JSX.Element => {
    if (items.length === 0) {
      return (
        <div className={styles.centerMessage}>
          <p>{t("Waiting for other participants…")}</p>
        </div>
      );
    }
    if (maximisedParticipant) {
      return (
        <VideoTileContainer
          height={bounds.height}
          width={bounds.width}
          key={maximisedParticipant.id}
          item={maximisedParticipant.data}
          getAvatar={renderAvatar}
          maximised={Boolean(maximisedParticipant)}
        />
      );
    }

    return (
      <VideoGrid
        items={items}
        layout={layout}
        disableAnimations={prefersReducedMotion || isSafari}
      >
        {(child) => (
          <VideoTileContainer
            getAvatar={renderAvatar}
            maximised={false}
            item={child.data}
            {...child}
          />
        )}
      </VideoGrid>
    );
  };

  const {
    modalState: rageshakeRequestModalState,
    modalProps: rageshakeRequestModalProps,
  } = useRageshakeRequestModal(groupCall.room.roomId);

  const containerClasses = classNames(styles.inRoom, {
    [styles.maximised]: maximisedParticipant,
  });

  let footer: JSX.Element | null;

  if (noControls) {
    footer = null;
  } else if (reducedControls) {
    footer = (
      <div className={styles.footer}>
        <MicButton muted={!isMicrophoneEnabled} onPress={toggleMicrophone} />
        <VideoButton muted={!isCameraEnabled} onPress={toggleCamera} />
        <HangupButton onPress={onLeave} />
      </div>
    );
  } else {
    footer = (
      <div className={styles.footer}>
        <MicButton muted={!isMicrophoneEnabled} onPress={toggleMicrophone} />
        <VideoButton muted={!isCameraEnabled} onPress={toggleCamera} />
        {canScreenshare && !hideScreensharing && !isSafari && (
          <ScreenshareButton
            enabled={isScreenShareEnabled}
            onPress={toggleScreenSharing}
          />
        )}
        {!maximisedParticipant && (
          <OverflowMenu
            roomId={matrixInfo.roomId}
            mediaDevices={mediaDevices}
            inCall
            showInvite={joinRule === JoinRule.Public}
            feedbackModalState={feedbackModalState}
            feedbackModalProps={feedbackModalProps}
          />
        )}
        <HangupButton onPress={onLeave} />
      </div>
    );
  }

  return (
    <div className={containerClasses} ref={containerRef}>
      {!hideHeader && !maximisedParticipant && (
        <Header>
          <LeftNav>
            <RoomHeaderInfo
              roomName={matrixInfo.roomName}
              avatarUrl={matrixInfo.avatarUrl}
            />
            <VersionMismatchWarning
              users={unencryptedEventsFromUsers}
              room={groupCall.room}
            />
          </LeftNav>
          <RightNav>
            <GridLayoutMenu layout={layout} setLayout={setLayout} />
            <UserMenuContainer preventNavigation />
          </RightNav>
        </Header>
      )}
      {renderContent()}
      {footer}
      <GroupCallInspector
        client={client}
        groupCall={groupCall}
        show={showInspector}
      />
      {rageshakeRequestModalState.isOpen && (
        <RageshakeRequestModal
          {...rageshakeRequestModalProps}
          roomIdOrAlias={matrixInfo.roomId}
        />
      )}
    </div>
  );
}

interface ParticipantID {
  userId: string;
  deviceId: string;
}

function useParticipantTiles(
  livekitRoom: Room,
  participants: Map<RoomMember, Map<string, ParticipantInfo>>,
  local: ParticipantID
): TileDescriptor<ItemData>[] {
  const sfuParticipants = useParticipants({
    room: livekitRoom,
  });

  const [localUserId, localDeviceId] = [local.userId, local.deviceId];

  const items = useMemo(() => {
    const tiles: TileDescriptor<ItemData>[] = [];
    for (const [member, participantMap] of participants) {
      for (const [deviceId] of participantMap) {
        const id = `${member.userId}:${deviceId}`;
        const sfuParticipant = sfuParticipants.find((p) => p.identity === id);

        const hasScreenShare =
          sfuParticipant?.getTrack(Track.Source.ScreenShare) !== undefined;

        const descriptor = {
          id,
          focused: hasScreenShare && !sfuParticipant?.isLocal,
          local: member.userId == localUserId && deviceId == localDeviceId,
          data: {
            member,
            sfuParticipant,
          },
        };

        tiles.push(descriptor);
      }
    }

    PosthogAnalytics.instance.eventCallEnded.cacheParticipantCountChanged(
      tiles.length
    );

    return tiles;
  }, [localUserId, localDeviceId, participants, sfuParticipants]);

  return items;
}
