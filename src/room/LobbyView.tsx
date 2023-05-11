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

import React, { useEffect, useRef } from "react";
import { GroupCall, GroupCallState } from "matrix-js-sdk/src/webrtc/groupCall";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { PressEvent } from "@react-types/shared";
import { CallFeed } from "matrix-js-sdk/src/webrtc/callFeed";
import { Trans, useTranslation } from "react-i18next";

import styles from "./LobbyView.module.css";
import { Button, CopyButton } from "../button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { useCallFeed } from "../video-grid/useCallFeed";
import { getRoomUrl } from "../matrix-utils";
import { UserMenuContainer } from "../UserMenuContainer";
import { Body, Link } from "../typography/Typography";
import { useLocationNavigation } from "../useLocationNavigation";
import { useMediaHandler } from "../settings/useMediaHandler";
import { VideoPreview } from "./VideoPreview";
import { AudioPreview } from "./AudioPreview";

interface Props {
  client: MatrixClient;
  groupCall: GroupCall;
  roomName: string;
  avatarUrl: string;
  state: GroupCallState;
  onInitLocalCallFeed: () => void;
  onEnter: (e: PressEvent) => void;
  localCallFeed: CallFeed;
  microphoneMuted: boolean;
  toggleLocalVideoMuted: () => void;
  toggleMicrophoneMuted: () => void;
  localVideoMuted: boolean;
  roomIdOrAlias: string;
  isEmbedded: boolean;
  hideHeader: boolean;
}
export function LobbyView({
  client,
  groupCall,
  roomName,
  avatarUrl,
  state,
  onInitLocalCallFeed,
  onEnter,
  localCallFeed,
  microphoneMuted,
  localVideoMuted,
  toggleLocalVideoMuted,
  toggleMicrophoneMuted,
  roomIdOrAlias,
  isEmbedded,
  hideHeader,
}: Props) {
  const { t } = useTranslation();
  const { stream } = useCallFeed(localCallFeed);
  const {
    audioInput,
    audioInputs,
    setAudioInput,
    audioOutput,
    audioOutputs,
    setAudioOutput,
  } = useMediaHandler();

  useEffect(() => {
    onInitLocalCallFeed();
  }, [onInitLocalCallFeed]);

  useLocationNavigation(state === GroupCallState.InitializingLocalCallFeed);

  const joinCallButtonRef = useRef<HTMLButtonElement>();

  useEffect(() => {
    if (state === GroupCallState.LocalCallFeedInitialized) {
      joinCallButtonRef.current.focus();
    }
  }, [state]);

  return (
    <div className={styles.room}>
      {!hideHeader && (
        <Header>
          <LeftNav>
            <RoomHeaderInfo roomName={roomName} avatarUrl={avatarUrl} />
          </LeftNav>
          <RightNav>
            <UserMenuContainer />
          </RightNav>
        </Header>
      )}
      <div className={styles.joinRoom}>
        <div className={styles.joinRoomContent}>
          {groupCall.isPtt ? (
            <AudioPreview
              roomName={roomName}
              state={state}
              audioInput={audioInput}
              audioInputs={audioInputs}
              setAudioInput={setAudioInput}
              audioOutput={audioOutput}
              audioOutputs={audioOutputs}
              setAudioOutput={setAudioOutput}
            />
          ) : (
            <VideoPreview
              state={state}
              client={client}
              roomIdOrAlias={roomIdOrAlias}
              microphoneMuted={microphoneMuted}
              localVideoMuted={localVideoMuted}
              toggleLocalVideoMuted={toggleLocalVideoMuted}
              toggleMicrophoneMuted={toggleMicrophoneMuted}
              stream={stream}
              audioOutput={audioOutput}
            />
          )}
          <Trans>
            <Button
              ref={joinCallButtonRef}
              className={styles.copyButton}
              size="lg"
              disabled={state !== GroupCallState.LocalCallFeedInitialized}
              onPress={onEnter}
              data-testid="lobby_joinCall"
            >
              Join call now
            </Button>
            <Body>Or</Body>
            <CopyButton
              variant="secondaryCopy"
              value={getRoomUrl(roomIdOrAlias)}
              className={styles.copyButton}
              copiedMessage={t("Call link copied")}
              data-testid="lobby_inviteLink"
            >
              Copy call link and join later
            </CopyButton>
          </Trans>
        </div>
        {!isEmbedded && (
          <Body className={styles.joinRoomFooter}>
            <Link color="primary" to="/">
              {t("Take me Home")}
            </Link>
          </Body>
        )}
      </div>
    </div>
  );
}
