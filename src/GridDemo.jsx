import React, { useCallback, useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { useDrag } from "react-use-gesture";
import { useSprings, useTransition, animated } from "@react-spring/web";
import styles from "./GridDemo.module.css";
import useMeasure from "react-use-measure";

export function GridDemo() {
  const tileKey = useRef(0);
  const [stream, setStream] = useState();
  const [tiles, setTiles] = useState([]);
  const [tileStyles, setTileStyles] = useState({});

  const [springs, api] = useSprings(tiles.length, (index) => ({
    from: { x: 0, y: 0, zIndex: 0, shadow: 1, scale: 1 },
    config: {
      tension: 250,
    },
  }));

  const startWebcam = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    setStream(stream);
    setTiles([{ stream, key: tileKey.current++ }]);
  }, []);

  const addTile = useCallback(() => {
    const newStream = stream.clone();
    setTiles((tiles) => [
      ...tiles,
      { stream: newStream, key: tileKey.current++ },
    ]);
  }, [stream]);

  const removeTile = useCallback(() => {
    setTiles((tiles) => {
      const newArr = [...tiles];
      newArr.pop();
      return newArr;
    });
  }, []);

  const [gridRef, gridBounds] = useMeasure();

  useEffect(() => {
    const newTileStyles = {};
    const tileCount = tiles.length;
    const { width: gridWidth, height: gridHeight } = gridBounds;
    const gap = 8;

    if (tileCount > 0) {
      const aspectRatio = gridWidth / gridHeight;

      let columnCount, rowCount;

      if (aspectRatio < 1) {
        if (tileCount <= 4) {
          columnCount = 1;
          rowCount = tileCount;
        } else if (tileCount <= 12) {
          columnCount = 2;
          rowCount = Math.ceil(tileCount / 2);
        }
      } else {
        if (tileCount === 1) {
          columnCount = 1;
          rowCount = 1;
        } else if (tileCount === 2) {
          columnCount = 2;
          rowCount = 1;
        } else if (tileCount <= 4) {
          columnCount = 2;
          rowCount = 2;
        } else if (tileCount <= 6) {
          columnCount = 3;
          rowCount = 2;
        } else if (tileCount <= 8) {
          columnCount = 4;
          rowCount = 2;
        } else if (tileCount <= 10) {
          columnCount = 5;
          rowCount = 2;
        } else if (tileCount <= 12) {
          columnCount = 4;
          rowCount = 3;
        }
      }

      let tileHeight = Math.round(
        (gridHeight - gap * (rowCount + 1)) / rowCount
      );
      let tileWidth = Math.round(
        (gridWidth - gap * (columnCount + 1)) / columnCount
      );

      const tileAspectRatio = tileWidth / tileHeight;

      if (tileAspectRatio > 16 / 9) {
        tileWidth = (16 * tileHeight) / 9;
      }

      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];

        const verticalIndex = Math.floor(i / columnCount);
        const top = verticalIndex * tileHeight + (verticalIndex + 1) * gap;

        let rowItemCount;

        if (verticalIndex + 1 === rowCount && tileCount % rowCount !== 0) {
          rowItemCount = Math.floor(tileCount / rowCount);
        } else {
          rowItemCount = Math.ceil(tileCount / rowCount);
        }

        const horizontalIndex = i % columnCount;
        const totalRowGapWidth = (rowItemCount + 1) * gap;
        const totalRowTileWidth = rowItemCount * tileWidth;
        const rowLeftMargin = Math.round(
          (gridWidth - (totalRowTileWidth + totalRowGapWidth)) / 2
        );
        const left =
          tileWidth * horizontalIndex +
          rowLeftMargin +
          (horizontalIndex + 1) * gap;

        newTileStyles[tile.key] = {
          width: tileWidth,
          height: tileHeight,
          transform: `translate(${left}px, ${top}px)`,
        };
      }
    }

    setTileStyles(newTileStyles);
  }, [gridBounds, tiles]);

  const bind = useDrag(({ args: [index], down, movement: [x, y] }) => {
    api.start((springIndex) => {
      const dragging = springIndex === index && down;
      return {
        x: dragging ? x : 0,
        y: dragging ? y : 0,
        scale: dragging ? 1.1 : 1,
        zIndex: dragging ? 1 : 0,
        shadow: dragging ? 15 : 1,
        immediate: dragging
          ? (key) => key === "zIndex" || key === "x" || key === "y"
          : false,
      };
    });
  });

  return (
    <div className={styles.gridDemo}>
      <div className={styles.buttons}>
        {!stream && <button onClick={startWebcam}>Start Webcam</button>}
        {stream && <button onClick={addTile}>Add Tile</button>}
        {stream && <button onClick={removeTile}>Remove Tile</button>}
      </div>
      <div className={styles.grid} ref={gridRef}>
        {springs.map(({ shadow, ...springStyles }, i) => {
          const tile = tiles[i];

          return (
            <ParticipantTile
              {...bind(i)}
              key={tile.key}
              style={{
                ...tileStyles[tile.key],
                ...springStyles,
                boxShadow: shadow.to(
                  (s) => `rgba(0, 0, 0, 0.5) 0px ${s}px ${2 * s}px 0px`
                ),
              }}
              {...tile}
            />
          );
        })}
      </div>
    </div>
  );
}

function ParticipantTile({ style, stream, ...rest }) {
  const videoRef = useRef();

  useEffect(() => {
    if (stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play();
    } else {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  return (
    <animated.div className={styles.participantTile} style={style} {...rest}>
      <video ref={videoRef} playsInline />
    </animated.div>
  );
}
