import React, { useCallback, useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { useDrag } from "react-use-gesture";
import { useSpring, useTransition, animated } from "@react-spring/web";
import styles from "./GridDemo.module.css";

let tileIdx = 0;

export function GridDemo() {
  const [stream, setStream] = useState();
  const [tiles, setTiles] = useState([]);

  const startWebcam = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    setStream(stream);
    setTiles([{ stream, key: tileIdx++ }]);
  }, []);

  const addTile = useCallback(() => {
    const newStream = stream.clone();
    setTiles((tiles) => [...tiles, { stream: newStream, key: tileIdx++ }]);
  }, [stream]);

  const removeTile = useCallback(() => {
    setTiles((tiles) => {
      const newArr = [...tiles];
      newArr.pop();
      return newArr;
    });
  }, []);

  useEffect(() => {
    console.log(tiles);
  }, [tiles]);

  const tileTransitions = useTransition(tiles, {
    from: { opacity: 0, scale: 0.5 },
    enter: { opacity: 1, scale: 1 },
    leave: { opacity: 0, scale: 0.5 },
  });

  return (
    <div className={styles.gridDemo}>
      <div className={styles.buttons}>
        {!stream && <button onClick={startWebcam}>Start Webcam</button>}
        {stream && <button onClick={addTile}>Add Tile</button>}
        {stream && <button onClick={removeTile}>Remove Tile</button>}
      </div>
      <div className={styles.grid}>
        {tileTransitions((style, tile) => (
          <ParticipantTile key={tile.key} style={style} {...tile} />
        ))}
      </div>
    </div>
  );
}

function ParticipantTile({ style, stream }) {
  const videoRef = useRef();

  useEffect(() => {
    if (stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play();
    } else {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  const [{ x, y }, api] = useSpring(() => ({
    from: { x: 0, y: 0 },
    config: {
      tension: 250,
    },
  }));

  const bind = useDrag(({ down, movement: [mx, my] }) => {
    api.start({ x: down ? mx : 0, y: down ? my : 0 });
  });

  return (
    <animated.div
      {...bind()}
      className={styles.participantTile}
      style={{ x, y, ...style }}
    >
      <video ref={videoRef} playsInline />
    </animated.div>
  );
}
