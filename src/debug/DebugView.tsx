/*
Copyright 2024 New Vector Ltd

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

import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import { FC, useState } from "react";
import { Text } from "@vector-im/compound-web";
import { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { CallMembership } from "matrix-js-sdk/src/matrixrtc/CallMembership";

import styles from "./DebugView.module.css";

interface Props {
  rtcSession: MatrixRTCSession;
  client: MatrixClient;
}

export const DebugView: FC<Props> = ({ rtcSession, client }) => {
  const [isShown, setIsShown] = useState(true);
  const room = rtcSession.room;
  const events = room
    .getLiveTimeline()
    .getEvents()
    .filter((ev) => ev.getType() === "io.element.call.encryption_keys")
    .map((ev: MatrixEvent) => <EncryptionEventContainer event={ev} />);
  const listItems = rtcSession.memberships.map((m) => (
    <MemberContainer membership={m} />
  ));
  return (
    <div className={styles.container}>
      {isShown && (
        <div className={styles.dataContainer}>
          {listItems}
          <ul>{events}</ul>
        </div>
      )}
      <button
        className={styles.hideButton}
        onClick={() => setIsShown(!isShown)}
      >
        {isShown ? <b>{"<"}</b> : <b>{">"}</b>}
      </button>
    </div>
  );
};

interface MemberContainerProps {
  membership: CallMembership;
}
const MemberContainer: FC<MemberContainerProps> = ({ membership }) => {
  return (
    <div className={styles.memberContainer}>
      <Text as="span" size="md" weight="semibold">
        {membership.sender}
      </Text>
      <br />
      <Text as="span" size="sm" weight="regular">
        Device Id: {membership.deviceId}
      </Text>
    </div>
  );
};

interface EncryptionEventContainerProps {
  event: MatrixEvent;
}
const EncryptionEventContainer: FC<EncryptionEventContainerProps> = ({
  event,
}) => {
  const keys = event
    .getContent()
    .keys.map((obj: { index: number; key: string }) => (
      <>
        index {obj.index}: {obj.key}
        <br />
      </>
    ));
  return (
    <div className={styles.memberContainer}>
      <Text as="span" size="md" weight="semibold">
        {event.sender}
      </Text>
      <br />
      <Text as="span" size="sm" weight="regular">
        Keys: {keys}
      </Text>
      <br />
    </div>
  );
};
