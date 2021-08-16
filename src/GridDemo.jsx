import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDrag } from "react-use-gesture";
import { useSprings, animated, useSpring } from "@react-spring/web";
import styles from "./GridDemo.module.css";
import useMeasure from "react-use-measure";

function isInside([x, y], targetTile) {
  const left = targetTile.x;
  const top = targetTile.y;
  const bottom = targetTile.y + targetTile.height;
  const right = targetTile.x + targetTile.width;

  if (x < left || x > right || y < top || y > bottom) {
    return false;
  }

  return true;
}

export function GridDemo() {
  const tileKey = useRef(0);
  const [stream, setStream] = useState();
  const [{ tiles, tilePositions }, setTileState] = useState({
    tiles: [],
    tilePositions: [],
  });
  const draggingTileRef = useRef(null);

  // Contains tile indices
  // Tiles are displayed in the order that they appear
  const tileOrderRef = useRef([]);

  const [gridRef, gridBounds] = useMeasure();

  const getTilePositions = useCallback((tiles, gridBounds) => {
    const newTilePositions = [];
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

        newTilePositions.push({
          width: tileWidth,
          height: tileHeight,
          x: left,
          y: top,
        });
      }
    }

    return newTilePositions;
  }, []);

  const startWebcam = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    setStream(stream);
    tileOrderRef.current.push(tileOrderRef.current.length);
    setTileState(() => {
      const tiles = [{ stream, key: tileKey.current++, remove: false }];
      const tilePositions = getTilePositions(tiles, gridBounds);
      return { tiles, tilePositions };
    });
  }, [gridBounds]);

  const addTile = useCallback(() => {
    const newStream = stream.clone();

    tileOrderRef.current.push(tileOrderRef.current.length);

    setTileState(({ tiles }) => {
      const newTiles = [
        ...tiles,
        { stream: newStream, key: tileKey.current++, remove: false },
      ];

      return {
        tiles: newTiles,
        tilePositions: getTilePositions(newTiles, gridBounds),
      };
    });
  }, [stream, gridBounds]);

  const removeTile = useCallback(
    (tile) => {
      const tileKey = tile.key;

      setTileState(({ tiles, tilePositions }) => {
        return {
          tiles: tiles.map((tile) => ({
            ...tile,
            remove: tile.key === tileKey,
          })),
          tilePositions,
        };
      });

      setTimeout(() => {
        setTileState(({ tiles }) => {
          const tileIndex = tiles.findIndex((tile) => tile.key === tileKey);
          const newTiles = [...tiles];
          newTiles.splice(tileIndex, 1);
          tileOrderRef.current = tileOrderRef.current.filter(
            (index) => index !== tileIndex
          );
          return {
            tiles: newTiles,
            tilePositions: getTilePositions(newTiles, gridBounds),
          };
        });
      }, 250);
    },
    [gridBounds]
  );

  useEffect(() => {
    setTileState(({ tiles }) => ({
      tiles,
      tilePositions: getTilePositions(tiles, gridBounds),
    }));
  }, [gridBounds]);

  const animate = useCallback(
    (order) => (index) => {
      const tileIndex = order[index];
      const tile = tiles[tileIndex];
      const tilePosition = tilePositions[tileIndex];
      const draggingTile = draggingTileRef.current;
      const dragging = draggingTile && tile.key === draggingTile.key;
      const remove = tile.remove;

      if (dragging) {
        return {
          width: tilePosition.width,
          height: tilePosition.height,
          x: tilePosition.x + draggingTile.x,
          y: tilePosition.y + draggingTile.y,
          scale: 1.1,
          opacity: 1,
          zIndex: 1,
          shadow: 15,
          immediate: (key) => key === "zIndex" || key === "x" || key === "y",
          from: {
            scale: 0,
            opacity: 0,
          },
          reset: false,
        };
      } else {
        return {
          ...tilePosition,
          scale: remove ? 0 : 1,
          opacity: remove ? 0 : 1,
          zIndex: 0,
          shadow: 1,
          immediate: false,
          from: {
            scale: 0,
            opacity: 0,
          },
          reset: false,
        };
      }
    },
    [tiles, tilePositions]
  );

  const [springs, api] = useSprings(
    tiles.length,
    animate(tileOrderRef.current),
    [tilePositions, tiles]
  );

  const bind = useDrag(({ args: [index], active, xy, movement }) => {
    let order = tileOrderRef.current;

    const tileIndex = tileOrderRef.current[index];
    const tile = tiles[tileIndex];

    const cursorPosition = [xy[0] - gridBounds.left, xy[1] - gridBounds.top];

    for (let i = 0; i < tileOrderRef.current.length; i++) {
      if (i === index) {
        continue;
      }

      const hoverTileIndex = tileOrderRef.current[i];
      const hoverTilePosition = tilePositions[hoverTileIndex];

      if (isInside(cursorPosition, hoverTilePosition)) {
        // TODO: Figure out swapping
        // order[i] = tileIndex;
        // order[index] = i;
        break;
      }
    }

    if (active) {
      draggingTileRef.current = {
        key: tile.key,
        x: movement[0],
        y: movement[1],
      };
    } else {
      draggingTileRef.current = null;
    }

    api.start(animate(order));
  });

  return (
    <div className={styles.gridDemo}>
      <div className={styles.buttons}>
        {!stream && <button onClick={startWebcam}>Start Webcam</button>}
        {stream && tiles.length < 12 && (
          <button onClick={addTile}>Add Tile</button>
        )}
        {stream && tiles.length > 0 && (
          <button onClick={() => removeTile(tiles[tiles.length - 1])}>
            Remove Tile
          </button>
        )}
      </div>
      <div className={styles.grid} ref={gridRef}>
        {springs.map(({ shadow, ...style }, i) => {
          const tileIndex = tileOrderRef.current[i];
          const tile = tiles[tileIndex];

          return (
            <ParticipantTile
              {...bind(i)}
              key={tile.key}
              style={{
                boxShadow: shadow.to(
                  (s) => `rgba(0, 0, 0, 0.5) 0px ${s}px ${2 * s}px 0px`
                ),
                ...style,
              }}
              {...tile}
            />
          );
        })}
      </div>
    </div>
  );
}

function ParticipantTile({ style, stream, remove, tileKey, ...rest }) {
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
