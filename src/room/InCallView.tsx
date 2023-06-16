/*
Copyright 2022 - 2023 New Vector Ltd

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
import React from "react";
import { ResizeObserver } from "@juggle/resize-observer";
import {
  useLiveKitRoom,
  useLocalParticipant,
  useParticipants,
  useToken,
  useTracks,
} from "@livekit/components-react";
import { usePreventScroll } from "@react-aria/overlays";
import { OverlayTriggerState } from "@react-stately/overlays";
import classNames from "classnames";
import { Room, Track } from "livekit-client";
import { JoinRule } from "matrix-js-sdk/src/@types/partials";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { Ref, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import useMeasure from "react-use-measure";

import type { IWidgetApiRequest } from "matrix-widget-api";
import {
  Header,
  LeftNav,
  RightNav,
  RoomHeaderInfo,
  VersionMismatchWarning,
} from "../Header";
import { useModalTriggerState } from "../Modal";
import { useUrlParams } from "../UrlParams";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import {
  HangupButton,
  InviteButton,
  MicButton,
  ScreenshareButton,
  SettingsButton,
  VideoButton,
} from "../button";
import { Config } from "../config/Config";
import {
  LocalUserChoices,
  MediaDevicesList,
} from "../livekit/useMediaDevicesChoices";
import { OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { SettingsModal } from "../settings/SettingsModal";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { useShowInspector } from "../settings/useSetting";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { NewVideoGrid } from "../video-grid/NewVideoGrid";
import {
  TileDescriptor,
  VideoGrid,
  useVideoGridLayout,
} from "../video-grid/VideoGrid";
import { ItemData, TileContent, VideoTile } from "../video-grid/VideoTile";
import { ElementWidgetActions, widget } from "../widget";
import { GridLayoutMenu } from "./GridLayoutMenu";
import { GroupCallInspector } from "./GroupCallInspector";
import styles from "./InCallView.module.css";
import { InviteModal } from "./InviteModal";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { MatrixInfo } from "./VideoPreview";
import { ParticipantInfo } from "./useGroupCall";
import { useJoinRule } from "./useJoinRule";

const canScreenshare = "getDisplayMedia" in (navigator.mediaDevices ?? {});
// There is currently a bug in Safari our our code with cloning and sending MediaStreams
// or with getUsermedia and getDisplaymedia being used within the same session.
// For now we can disable screensharing in Safari.
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const onConnectedCallback = (): void => {
  console.log("connected to LiveKit room");
};
const onDisconnectedCallback = (): void => {
  console.log("disconnected from LiveKit room");
};
const onErrorCallback = (err: Error): void => {
  console.error("error connecting to LiveKit room", err);
};

interface Props {
  client: MatrixClient;
  groupCall: GroupCall;
  participants: Map<RoomMember, Map<string, ParticipantInfo>>;
  onLeave: () => void;
  unencryptedEventsFromUsers: Set<string>;
  hideHeader: boolean;
  matrixInfo: MatrixInfo;
  mediaDevices: MediaDevicesList;
  userChoices: LocalUserChoices;
  otelGroupCallMembership: OTelGroupCallMembership;
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
  userChoices,
  otelGroupCallMembership,
  livekitRoom,
}: Props) {
  const { t } = useTranslation();
  usePreventScroll();

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
    `${Config.get().livekit.jwt_service_url}/token`,
    matrixInfo.roomName,
    options
  );

  // TODO: move the room creation into the useRoom hook and out of the useLiveKit hook.
  // This would than allow to not have those 4 lines
  livekitRoom.options.audioCaptureDefaults.deviceId =
    userChoices.activeAudioDeviceId;
  livekitRoom.options.videoCaptureDefaults.deviceId =
    userChoices.activeVideoDeviceId;
  // Uses a hook to connect to the LiveKit room (on unmount the room will be left) and publish local media tracks (default).

  useLiveKitRoom({
    token,
    serverUrl: Config.get().livekit.server_url,
    room: livekitRoom,
    audio: userChoices.audioEnabled,
    video: userChoices.videoEnabled,
    // simulateParticipants: 10,
    onConnected: onConnectedCallback,
    onDisconnected: onDisconnectedCallback,
    onError: onErrorCallback,
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

  const { hideScreensharing } = useUrlParams();

  const {
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    localParticipant,
  } = useLocalParticipant({
    room: livekitRoom,
  });

  const toggleMicrophone = useCallback(async () => {
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [localParticipant, isMicrophoneEnabled]);
  const toggleCamera = useCallback(async () => {
    await localParticipant.setCameraEnabled(!isCameraEnabled);
  }, [localParticipant, isCameraEnabled]);
  const toggleScreensharing = useCallback(async () => {
    await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
  }, [localParticipant, isScreenShareEnabled]);

  const joinRule = useJoinRule(groupCall.room);

  useCallViewKeyboardShortcuts(
    containerRef1,
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
  const items = useParticipantTiles(livekitRoom, participants);

  // The maximised participant is the focused (active) participant, given the
  // window is too small to show everyone
  const maximisedParticipant = useMemo(
    () =>
      noControls
        ? items.find((item) => item.focused) ?? items.at(0) ?? null
        : null,
    [noControls, items]
  );

  const Grid =
    items.length > 12 && layout === "freedom" ? NewVideoGrid : VideoGrid;

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
        <VideoTile
          targetHeight={bounds.height}
          targetWidth={bounds.width}
          key={maximisedParticipant.id}
          data={maximisedParticipant.data}
        />
      );
    }

    return (
      <Grid
        items={items}
        layout={layout}
        disableAnimations={prefersReducedMotion || isSafari}
      >
        {(props) => (
          <VideoTile {...props} ref={props.ref as Ref<HTMLDivElement>} />
        )}
      </Grid>
    );
  };

  const {
    modalState: rageshakeRequestModalState,
    modalProps: rageshakeRequestModalProps,
  } = useRageshakeRequestModal(groupCall.room.roomId);

  const {
    modalState: settingsModalState,
    modalProps: settingsModalProps,
  }: {
    modalState: OverlayTriggerState;
    modalProps: {
      isOpen: boolean;
      onClose: () => void;
    };
  } = useModalTriggerState();

  const openSettings = useCallback(() => {
    settingsModalState.open();
  }, [settingsModalState]);

  const {
    modalState: inviteModalState,
    modalProps: inviteModalProps,
  }: {
    modalState: OverlayTriggerState;
    modalProps: {
      isOpen: boolean;
      onClose: () => void;
    };
  } = useModalTriggerState();

  const openInvite = useCallback(() => {
    inviteModalState.open();
  }, [inviteModalState]);

  const containerClasses = classNames(styles.inRoom, {
    [styles.maximised]: undefined,
  });

  let footer: JSX.Element | null;

  if (noControls) {
    footer = null;
  } else {
    const buttons: JSX.Element[] = [];

    buttons.push(
      <MicButton
        key="1"
        muted={!isMicrophoneEnabled}
        onPress={toggleMicrophone}
        data-testid="incall_mute"
      />,
      <VideoButton
        key="2"
        muted={!isCameraEnabled}
        onPress={toggleCamera}
        data-testid="incall_videomute"
      />
    );

    if (!reducedControls) {
      if (canScreenshare && !hideScreensharing && !isSafari) {
        buttons.push(
          <ScreenshareButton
            key="3"
            enabled={isScreenShareEnabled}
            onPress={toggleScreensharing}
            data-testid="incall_screenshare"
          />
        );
      }
      if (!maximisedParticipant) {
        buttons.push(<SettingsButton key="4" onPress={openSettings} />);
      }
    }

    buttons.push(
      <HangupButton key="6" onPress={onLeave} data-testid="incall_leave" />
    );
    footer = <div className={styles.footer}>{buttons}</div>;
  }

  return (
    <div className={containerClasses} ref={containerRef}>
      {!hideHeader && (
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
            {joinRule === JoinRule.Public && (
              <InviteButton variant="icon" onClick={openInvite} />
            )}
          </RightNav>
        </Header>
      )}
      <div className={styles.controlsOverlay}>
        {renderContent()}
        {footer}
      </div>
      <GroupCallInspector
        client={client}
        groupCall={groupCall}
        otelGroupCallMembership={otelGroupCallMembership}
        show={showInspector}
      />
      {rageshakeRequestModalState.isOpen && !noControls && (
        <RageshakeRequestModal
          {...rageshakeRequestModalProps}
          roomIdOrAlias={matrixInfo.roomIdOrAlias}
        />
      )}
      {settingsModalState.isOpen && (
        <SettingsModal
          client={client}
          roomId={groupCall.room.roomId}
          mediaDevices={mediaDevices}
          userChoices={userChoices}
          {...settingsModalProps}
        />
      )}
      {inviteModalState.isOpen && (
        <InviteModal
          roomIdOrAlias={matrixInfo.roomIdOrAlias}
          {...inviteModalProps}
        />
      )}
    </div>
  );
}

function useParticipantTiles(
  livekitRoom: Room,
  participants: Map<RoomMember, Map<string, ParticipantInfo>>
): TileDescriptor<ItemData>[] {
  const sfuParticipants = useParticipants({
    room: livekitRoom,
  });

  const items = useMemo(() => {
    // The IDs of the participants who published membership event to the room (i.e. are present from Matrix perspective).
    const matrixParticipants: Map<string, RoomMember> = new Map(
      [...participants.entries()].flatMap(([user, devicesMap]) => {
        return [...devicesMap.keys()].map((deviceId) => [
          `${user.userId}:${deviceId}`,
          user,
        ]);
      })
    );

    const someoneIsPresenting = sfuParticipants.some((p) => {
      !p.isLocal && p.isScreenShareEnabled;
    });

    // Iterate over SFU participants (those who actually are present from the SFU perspective) and create tiles for them.
    const tiles: TileDescriptor<ItemData>[] = sfuParticipants.flatMap(
      (sfuParticipant) => {
        const id = sfuParticipant.identity;
        const member = matrixParticipants.get(id);

        const userMediaTile = {
          id,
          focused: !someoneIsPresenting && sfuParticipant.isSpeaking,
          local: sfuParticipant.isLocal,
          data: {
            member,
            sfuParticipant,
            content: TileContent.UserMedia,
          },
        };

        // If there is a screen sharing enabled for this participant, create a tile for it as well.
        let screenShareTile: TileDescriptor<ItemData> | undefined;
        if (sfuParticipant.isScreenShareEnabled) {
          screenShareTile = {
            ...userMediaTile,
            id: `${id}:screen-share`,
            focused: true,
            data: {
              ...userMediaTile.data,
              content: TileContent.ScreenShare,
            },
          };
        }

        return screenShareTile
          ? [userMediaTile, screenShareTile]
          : [userMediaTile];
      }
    );

    PosthogAnalytics.instance.eventCallEnded.cacheParticipantCountChanged(
      tiles.length
    );

    return tiles;
  }, [participants, sfuParticipants]);

  return items;
}
