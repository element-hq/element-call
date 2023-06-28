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

import { ResizeObserver } from "@juggle/resize-observer";
import {
  useLocalParticipant,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import { usePreventScroll } from "@react-aria/overlays";
import classNames from "classnames";
import { Room, Track } from "livekit-client";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import React, { Ref, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import useMeasure from "react-use-measure";
import { OverlayTriggerState } from "@react-stately/overlays";
import { JoinRule } from "matrix-js-sdk/src/@types/partials";

import type { IWidgetApiRequest } from "matrix-widget-api";
import {
  HangupButton,
  MicButton,
  VideoButton,
  ScreenshareButton,
  SettingsButton,
  InviteButton,
} from "../button";
import {
  Header,
  LeftNav,
  RightNav,
  RoomHeaderInfo,
  VersionMismatchWarning,
} from "../Header";
import {
  VideoGrid,
  useVideoGridLayout,
  TileDescriptor,
} from "../video-grid/VideoGrid";
import {
  useShowInspector,
  useShowConnectionStats,
} from "../settings/useSetting";
import { useModalTriggerState } from "../Modal";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { useUrlParams } from "../UrlParams";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { ElementWidgetActions, widget } from "../widget";
import { GridLayoutMenu } from "./GridLayoutMenu";
import { GroupCallInspector } from "./GroupCallInspector";
import styles from "./InCallView.module.css";
import { MatrixInfo } from "./VideoPreview";
import { useJoinRule } from "./useJoinRule";
import { ParticipantInfo } from "./useGroupCall";
import { ItemData, TileContent } from "../video-grid/VideoTile";
import { NewVideoGrid } from "../video-grid/NewVideoGrid";
import { OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { SettingsModal } from "../settings/SettingsModal";
import { InviteModal } from "./InviteModal";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { VideoTile } from "../video-grid/VideoTile";
import { UserChoices, useLiveKit } from "../livekit/useLiveKit";
import { useMediaDevices } from "../livekit/useMediaDevices";
import { SFUConfig } from "../livekit/openIDSFU";

const canScreenshare = "getDisplayMedia" in (navigator.mediaDevices ?? {});
// There is currently a bug in Safari our our code with cloning and sending MediaStreams
// or with getUsermedia and getDisplaymedia being used within the same session.
// For now we can disable screensharing in Safari.
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export interface ActiveCallProps extends Omit<InCallViewProps, "livekitRoom"> {
  userChoices: UserChoices;
  sfuConfig: SFUConfig;
}

export function ActiveCall(props: ActiveCallProps) {
  const livekitRoom = useLiveKit(props.userChoices, props.sfuConfig);

  return livekitRoom && <InCallView {...props} livekitRoom={livekitRoom} />;
}

export interface InCallViewProps {
  client: MatrixClient;
  groupCall: GroupCall;
  livekitRoom: Room;
  participants: Map<RoomMember, Map<string, ParticipantInfo>>;
  onLeave: () => void;
  unencryptedEventsFromUsers: Set<string>;
  hideHeader: boolean;
  matrixInfo: MatrixInfo;
  otelGroupCallMembership: OTelGroupCallMembership;
}

export function InCallView({
  client,
  groupCall,
  livekitRoom,
  participants,
  onLeave,
  unencryptedEventsFromUsers,
  hideHeader,
  matrixInfo,
  otelGroupCallMembership,
}: InCallViewProps) {
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

  // Managed media devices state coupled with an active room.
  const roomMediaDevices = useMediaDevices(livekitRoom);

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
  const [showConnectionStats] = useShowConnectionStats();

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
  const toggleScreensharing = useCallback(async () => {
    await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
  }, [localParticipant, isScreenShareEnabled]);

  const joinRule = useJoinRule(groupCall.room);

  // This function incorrectly assumes that there is a camera and microphone, which is not always the case.
  // TODO: Make sure that this module is resilient when it comes to camera/microphone availability!
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
          showSpeakingIndicator={false}
          showConnectionStats={showConnectionStats}
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
          <VideoTile
            showSpeakingIndicator={items.length > 2}
            showConnectionStats={showConnectionStats}
            {...props}
            ref={props.ref as Ref<HTMLDivElement>}
          />
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
              avatarUrl={matrixInfo.roomAvatarUrl}
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
          mediaDevices={roomMediaDevices}
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

    const hasPresenter =
      sfuParticipants.find((p) => p.isScreenShareEnabled) !== undefined;
    let allGhosts = true;

    const speakActiveTime = new Date();
    speakActiveTime.setSeconds(speakActiveTime.getSeconds() - 10);
    // Iterate over SFU participants (those who actually are present from the SFU perspective) and create tiles for them.
    const tiles: TileDescriptor<ItemData>[] = sfuParticipants.flatMap(
      (sfuParticipant) => {
        const hadSpokedInTime =
          !hasPresenter && sfuParticipant.lastSpokeAt
            ? sfuParticipant.lastSpokeAt > speakActiveTime
            : false;

        const id = sfuParticipant.identity;
        const member = matrixParticipants.get(id);
        allGhosts &&= member === undefined;

        const userMediaTile = {
          id,
          focused: false,
          isPresenter: sfuParticipant.isScreenShareEnabled,
          isSpeaker:
            (sfuParticipant.isSpeaking || hadSpokedInTime) &&
            !sfuParticipant.isLocal,
          hasVideo: sfuParticipant.isCameraEnabled,
          local: sfuParticipant.isLocal,
          largeBaseSize: false,
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
            largeBaseSize: true,
            placeNear: id,
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

    // If every item is a ghost, that probably means we're still connecting and
    // shouldn't bother showing anything yet
    return allGhosts ? [] : tiles;
  }, [participants, sfuParticipants]);

  return items;
}
