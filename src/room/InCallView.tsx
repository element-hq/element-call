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

import React, { useEffect, useCallback, useMemo, useRef } from "react";
import { usePreventScroll } from "@react-aria/overlays";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { CallFeed } from "matrix-js-sdk/src/webrtc/callFeed";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { OverlayTriggerState } from "@react-stately/overlays";
import { JoinRule } from "matrix-js-sdk/src/@types/partials";

import type { IWidgetApiRequest } from "matrix-widget-api";
import styles from "./InCallView.module.css";
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
import { VideoGrid, useVideoGridLayout } from "../video-grid/VideoGrid";
import { GroupCallInspector } from "./GroupCallInspector";
import { GridLayoutMenu } from "./GridLayoutMenu";
import { Avatar } from "../Avatar";
import { useMediaHandler } from "../settings/useMediaHandler";
import {
  useNewGrid,
  useShowInspector,
  useSpatialAudio,
} from "../settings/useSetting";
import { useModalTriggerState } from "../Modal";
import { useAudioContext } from "../video-grid/useMediaStream";
import { useFullscreen } from "../video-grid/useFullscreen";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { widget, ElementWidgetActions } from "../widget";
import { useJoinRule } from "./useJoinRule";
import { useUrlParams } from "../UrlParams";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { ParticipantInfo } from "./useGroupCall";
import { TileDescriptor } from "../video-grid/TileDescriptor";
import { AudioSink } from "../video-grid/AudioSink";
import { useCallViewKeyboardShortcuts } from "../useCallViewKeyboardShortcuts";
import { NewVideoGrid } from "../video-grid/NewVideoGrid";
import { OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { SettingsModal } from "../settings/SettingsModal";
import { InviteModal } from "./InviteModal";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { VideoTile } from "../video-grid/VideoTile";

const canScreenshare = "getDisplayMedia" in (navigator.mediaDevices ?? {});
// There is currently a bug in Safari our our code with cloning and sending MediaStreams
// or with getUsermedia and getDisplaymedia being used within the same session.
// For now we can disable screensharing in Safari.
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

interface Props {
  client: MatrixClient;
  groupCall: GroupCall;
  participants: Map<RoomMember, Map<string, ParticipantInfo>>;
  roomName: string;
  avatarUrl: string;
  microphoneMuted: boolean;
  localVideoMuted: boolean;
  toggleLocalVideoMuted: () => void;
  toggleMicrophoneMuted: () => void;
  toggleScreensharing: () => void;
  setMicrophoneMuted: (muted: boolean) => void;
  userMediaFeeds: CallFeed[];
  activeSpeaker: CallFeed | null;
  onLeave: () => void;
  isScreensharing: boolean;
  screenshareFeeds: CallFeed[];
  roomIdOrAlias: string;
  unencryptedEventsFromUsers: Set<string>;
  hideHeader: boolean;
  otelGroupCallMembership: OTelGroupCallMembership;
}

export function InCallView({
  client,
  groupCall,
  participants,
  roomName,
  avatarUrl,
  microphoneMuted,
  localVideoMuted,
  toggleLocalVideoMuted,
  toggleMicrophoneMuted,
  setMicrophoneMuted,
  userMediaFeeds,
  activeSpeaker,
  onLeave,
  toggleScreensharing,
  isScreensharing,
  screenshareFeeds,
  roomIdOrAlias,
  unencryptedEventsFromUsers,
  hideHeader,
  otelGroupCallMembership,
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

  const { layout, setLayout } = useVideoGridLayout(screenshareFeeds.length > 0);
  const { toggleFullscreen, fullscreenParticipant } =
    useFullscreen(containerRef1);

  const [spatialAudio] = useSpatialAudio();

  const [audioContext, audioDestination] = useAudioContext();
  const [showInspector] = useShowInspector();

  const { hideScreensharing } = useUrlParams();

  const joinRule = useJoinRule(groupCall.room);

  useCallViewKeyboardShortcuts(
    containerRef1,
    toggleMicrophoneMuted,
    toggleLocalVideoMuted,
    setMicrophoneMuted
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

  const items = useMemo(() => {
    const tileDescriptors: TileDescriptor[] = [];
    const localUserId = client.getUserId()!;
    const localDeviceId = client.getDeviceId()!;

    // One tile for each participant, to start with (we want a tile for everyone we
    // think should be in the call, even if we don't have a call feed for them yet)
    for (const [member, participantMap] of participants) {
      for (const [deviceId, { connectionState, presenter }] of participantMap) {
        const callFeed = userMediaFeeds.find(
          (f) => f.userId === member.userId && f.deviceId === deviceId
        );

        tileDescriptors.push({
          id: `${member.userId} ${deviceId}`,
          member,
          callFeed,
          focused: screenshareFeeds.length === 0 && callFeed === activeSpeaker,
          isLocal: member.userId === localUserId && deviceId === localDeviceId,
          presenter,
          isSpeaker: callFeed === activeSpeaker,
          largeBaseSize: false,
          connectionState,
        });
      }
    }

    PosthogAnalytics.instance.eventCallEnded.cacheParticipantCountChanged(
      tileDescriptors.length
    );

    // Add the screenshares too
    for (const screenshareFeed of screenshareFeeds) {
      const member = screenshareFeed.getMember()!;
      const deviceId = screenshareFeed.deviceId!;
      const connectionState = participants
        .get(member)
        ?.get(screenshareFeed.deviceId!)?.connectionState;

      // If the participant has left, their screenshare feed is stale and we
      // shouldn't bother showing it
      if (connectionState !== undefined) {
        tileDescriptors.push({
          id: screenshareFeed.stream.id,
          member,
          callFeed: screenshareFeed,
          focused: true,
          isLocal: screenshareFeed.isLocal(),
          presenter: false,
          isSpeaker: screenshareFeed === activeSpeaker,
          largeBaseSize: true,
          placeNear: `${member.userId} ${deviceId}`,
          connectionState,
        });
      }
    }

    return tileDescriptors;
  }, [client, participants, userMediaFeeds, activeSpeaker, screenshareFeeds]);

  const reducedControls = boundsValid && bounds.width <= 400;
  const noControls = reducedControls && bounds.height <= 400;

  // The maximised participant: either the participant that the user has
  // manually put in fullscreen, or the focused (active) participant if the
  // window is too small to show everyone
  const maximisedParticipant = useMemo(
    () =>
      fullscreenParticipant ??
      (noControls
        ? items.find((item) => item.focused) ??
          items.find((item) => item.callFeed) ??
          null
        : null),
    [fullscreenParticipant, noControls, items]
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

  const [newGrid] = useNewGrid();
  const Grid = newGrid ? NewVideoGrid : VideoGrid;
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
          item={maximisedParticipant}
          getAvatar={renderAvatar}
          audioContext={audioContext}
          audioDestination={audioDestination}
          maximised={Boolean(maximisedParticipant)}
          fullscreen={maximisedParticipant === fullscreenParticipant}
          onFullscreen={toggleFullscreen}
          showSpeakingIndicator={false}
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
            getAvatar={renderAvatar}
            audioContext={audioContext}
            audioDestination={audioDestination}
            maximised={false}
            fullscreen={false}
            onFullscreen={toggleFullscreen}
            showSpeakingIndicator={items.length > 2}
            {...props}
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
    [styles.maximised]: maximisedParticipant,
  });

  // If spatial audio is disabled, we render one audio tag for each participant
  // (with spatial audio, all the audio goes via the Web Audio API)
  // We also do this if there's a feed maximised because we only trigger spatial
  // audio rendering for feeds that we're displaying, which will need to be fixed
  // once we start having more participants than we can fit on a screen, but this
  // is a workaround for now.
  const { audioOutput } = useMediaHandler();
  const audioElements: JSX.Element[] = [];
  if (!spatialAudio || maximisedParticipant) {
    for (const item of items) {
      audioElements.push(
        <AudioSink
          tileDescriptor={item}
          audioOutput={audioOutput}
          otelGroupCallMembership={otelGroupCallMembership}
          key={item.id}
        />
      );
    }
  }

  let footer: JSX.Element | null;

  if (noControls) {
    footer = null;
  } else {
    const buttons: JSX.Element[] = [];

    buttons.push(
      <MicButton
        key="1"
        muted={microphoneMuted}
        onPress={toggleMicrophoneMuted}
        data-testid="incall_mute"
      />,
      <VideoButton
        key="2"
        muted={localVideoMuted}
        onPress={toggleLocalVideoMuted}
        data-testid="incall_videomute"
      />
    );

    if (!reducedControls) {
      if (canScreenshare && !hideScreensharing && !isSafari) {
        buttons.push(
          <ScreenshareButton
            key="3"
            enabled={isScreensharing}
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
      <>{audioElements}</>
      {!hideHeader && !maximisedParticipant && (
        <Header>
          <LeftNav>
            <RoomHeaderInfo roomName={roomName} avatarUrl={avatarUrl} />
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
          roomIdOrAlias={roomIdOrAlias}
        />
      )}
      {settingsModalState.isOpen && (
        <SettingsModal
          client={client}
          roomId={groupCall.room.roomId}
          {...settingsModalProps}
        />
      )}
      {inviteModalState.isOpen && (
        <InviteModal roomIdOrAlias={roomIdOrAlias} {...inviteModalProps} />
      )}
    </div>
  );
}
