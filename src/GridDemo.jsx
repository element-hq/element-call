import React, { useCallback, useRef, useState } from "react";
import styles from "./GridDemo.module.css";
import { VideoGrid } from "./VideoGrid";

export function GridDemo() {
  const participantKey = useRef(0);
  const [stream, setStream] = useState();
  const [participants, setParticipants] = useState([]);

  const startWebcam = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    setStream(stream);
    setParticipants([{ stream, userId: participantKey.current++ }]);
  }, []);

  const addParticipant = useCallback(() => {
    setParticipants((participants) => [
      ...participants,
      { stream: stream.clone(), userId: participantKey.current++ },
    ]);
  }, [stream]);

  const removeParticipant = useCallback((key) => {
    setParticipants((participants) =>
      participants.filter((participant) => participant.userId !== key)
    );
  }, []);

  return (
    <div className={styles.gridDemo}>
      <div className={styles.buttons}>
        {!stream && <button onClick={startWebcam}>Start Webcam</button>}
        {stream && participants.length < 12 && (
          <button onClick={addParticipant}>Add Tile</button>
        )}
        {stream && participants.length > 0 && (
          <button
            onClick={() =>
              removeParticipant(participants[participants.length - 1].userId)
            }
          >
            Remove Tile
          </button>
        )}
      </div>
      <VideoGrid participants={participants} />
    </div>
  );
}
