/*
Copyright 2021 New Vector Ltd

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
import styles from "./Room.module.css";
import { useParams } from "react-router-dom";
import { useVideoRoom } from "./ConferenceCallManagerHooks";

export function Room({ manager }) {
  const { roomId } = useParams();
  const { loading, joined, room, participants, error, joinCall } = useVideoRoom(
    manager,
    roomId
  );

  return (
    <div className={styles.room}>
      {!loading && room && (
        <div className={styles.header}>
          <h3>{room.name}</h3>
          <div className={styles.userNav}>
            <h5>{manager.client.getUserId()}</h5>
          </div>
        </div>
      )}
      {loading && (
        <div className={styles.centerMessage}>
          <p>Loading room...</p>
        </div>
      )}
      {error && <div className={styles.centerMessage}>{error.message}</div>}
      {!loading && room && !joined && (
        <div className={styles.joinRoom}>
          <h3>Members:</h3>
          <ul>
            {room.getMembers().map((member) => (
              <li key={member.userId}>{member.name}</li>
            ))}
          </ul>
          <button onClick={joinCall}>Join Call</button>
        </div>
      )}
      {!loading && room && joined && participants.length === 0 && (
        <div className={styles.centerMessage}>
          <p>Waiting for other participants...</p>
        </div>
      )}
      {!loading && room && joined && participants.length > 0 && (
        <div className={styles.roomContainer}>
          {participants.map((participant) => (
            <Participant key={participant.userId} participant={participant} />
          ))}
        </div>
      )}
    </div>
  );
}

function Participant({ participant }) {
  const videoRef = useRef();

  useEffect(() => {
    if (participant.feed) {
      if (participant.muted) {
        videoRef.current.muted = true;
      }

      videoRef.current.srcObject = participant.feed.stream;
      videoRef.current.play();
    }
  }, [participant.feed]);

  return (
    <div className={styles.participant}>
      <video ref={videoRef}></video>
      <div className={styles.participantLabel}>
        <p>
          {participant.userId} {participant.local && "(You)"}
        </p>
      </div>
    </div>
  );
}
