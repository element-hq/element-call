/*
Copyright 2023 New Vector Ltd

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

import { MatrixClient } from "matrix-js-sdk/src/client";
import { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { CallFeed } from "matrix-js-sdk/src/webrtc/callFeed";
import React from "react";
import { t } from "i18next";

import styles from "./MediaInspector.module.css";

interface MediaViewerProps {
  client: MatrixClient;
  groupCall: GroupCall;
  userMediaFeeds: CallFeed[];
  screenshareFeeds: CallFeed[];
}

export function MediaViewer({
  client,
  groupCall,
  userMediaFeeds,
  screenshareFeeds,
}: MediaViewerProps) {
  return (
    <div className={styles.scrollContainer}>
      <div className={styles.voIPInspectorViewer}>
        <Table name={t("Media Feeds")} feeds={userMediaFeeds} />
        <Table name={t("Screen Share Feeds")} feeds={screenshareFeeds} />
      </div>
    </div>
  );
}

// View Items ##########################################################################################################

interface TableProp {
  name: string;
  feeds: CallFeed[];
}

function Table({ name, feeds }: TableProp): JSX.Element {
  // Catch case if feeds is empty
  if (feeds.length === 0) {
    const noFeed = t("No Feeds…");
    return (
      <div className={styles.section}>
        <p className={styles.sectionTitle}>{name}</p>

        <div className={styles.centerMessage}>
          <p>{noFeed}</p>
        </div>
      </div>
    );
  }

  // Render Table
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>{name}</p>
      <header>
        <div className={styles.col}>Feed</div>
        <div className={styles.col}>User</div>
        <div className={styles.col}>StreamID</div>
        <div className={styles.col}>Tracks</div>
      </header>
      {feeds.map((feed, i) => {
        const user = feed.isLocal()
          ? "local"
          : feed.getMember() !== null
          ? feed.getMember()?.name
          : feed.userId;
        return (
          <TableRow
            key={feed.feedId}
            index={i}
            user={user ? user : feed.userId}
            stream={feed.stream}
          />
        );
      })}
    </div>
  );
}

interface TableRowProp {
  index: number;
  user: string;
  stream: MediaStream | undefined;
}

function TableRow({ index, user, stream }: TableRowProp): JSX.Element {
  return (
    <div className={styles.row}>
      <div className={styles.col}>{index}</div>
      <div className={styles.col}>{user}</div>
      <div className={styles.col}>{stream?.id}</div>
      <div className={styles.col}>
        {stream?.getTracks().map(
          (track): JSX.Element => (
            <TrackColumn key={track.id} kind={track.kind} trackId={track.id} />
          )
        )}
      </div>
    </div>
  );
}

interface TrackColumnProp {
  kind: string;
  trackId: string;
}

function TrackColumn({ kind, trackId }: TrackColumnProp): JSX.Element {
  return (
    <div className={styles.row}>
      <div className={styles.col}>{kind} &nbsp;</div>
      <div className={styles.col}>{trackId}</div>
    </div>
  );
}
