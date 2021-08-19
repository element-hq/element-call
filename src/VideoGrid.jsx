import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDrag } from "react-use-gesture";
import { useSprings, animated } from "@react-spring/web";
import styles from "./GridDemo.module.css";
import useMeasure from "react-use-measure";
import moveArrItem from "lodash-move";

function useIsMounted() {
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}

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

function getTilePositions(tileCount, gridBounds) {
  const newTilePositions = [];
  const { width: gridWidth, height: gridHeight } = gridBounds;
  const gap = 8;

  if (tileCount > 12) {
    console.warn("Over 12 tiles is not currently supported");
  }

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
      } else {
        // Unsupported
        columnCount = 3;
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
      } else {
        // Unsupported
        columnCount = 4;
        rowCount = 4;
      }
    }

    let tileHeight = Math.round((gridHeight - gap * (rowCount + 1)) / rowCount);
    let tileWidth = Math.round(
      (gridWidth - gap * (columnCount + 1)) / columnCount
    );

    const tileAspectRatio = tileWidth / tileHeight;

    if (tileAspectRatio > 16 / 9) {
      tileWidth = (16 * tileHeight) / 9;
    }

    for (let i = 0; i < tileCount; i++) {
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
}

export function VideoGrid({ participants }) {
  const [{ tiles, tilePositions }, setTileState] = useState({
    tiles: [],
    tilePositions: [],
  });
  const draggingTileRef = useRef(null);
  const isMounted = useIsMounted();

  const [gridRef, gridBounds] = useMeasure();

  useEffect(() => {
    setTileState(({ tiles }) => {
      const newTiles = [];
      const removedTileKeys = [];

      for (const tile of tiles) {
        const participant = participants.find(
          (participant) => participant.userId === tile.key
        );

        if (participant) {
          // Existing tiles
          newTiles.push({
            key: participant.userId,
            participant: participant,
            remove: false,
          });
        } else {
          // Removed tiles
          removedTileKeys.push(tile.key);
          newTiles.push({
            key: tile.key,
            participant: tile.participant,
            remove: true,
          });
        }
      }

      for (const participant of participants) {
        if (newTiles.some(({ key }) => participant.userId === key)) {
          continue;
        }

        // Added tiles
        newTiles.push({
          key: participant.userId,
          participant,
          remove: false,
        });
      }

      if (removedTileKeys.length > 0) {
        setTimeout(() => {
          if (!isMounted.current) {
            return;
          }

          setTileState(({ tiles }) => {
            const newTiles = tiles.filter(
              (tile) => !removedTileKeys.includes(tile.key)
            );

            return {
              tiles: newTiles,
              tilePositions: getTilePositions(newTiles.length, gridBounds),
            };
          });
        }, 250);
      }

      return {
        tiles: newTiles,
        tilePositions: getTilePositions(newTiles.length, gridBounds),
      };
    });
  }, [participants, gridBounds]);

  const animate = useCallback(
    (tiles) => (tileIndex) => {
      const tile = tiles[tileIndex];
      const tilePosition = tilePositions[tileIndex];
      const draggingTile = draggingTileRef.current;
      const dragging = draggingTile && tile.key === draggingTile.key;
      const remove = tile.remove;

      if (dragging) {
        return {
          width: tilePosition.width,
          height: tilePosition.height,
          x: draggingTile.offsetX + draggingTile.x,
          y: draggingTile.offsetY + draggingTile.y,
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
          from: {
            scale: 0,
            opacity: 0,
          },
          reset: false,
          immediate: (key) => key === "zIndex",
        };
      }
    },
    [tiles, tilePositions]
  );

  const [springs, api] = useSprings(tiles.length, animate(tiles), [
    tilePositions,
    tiles,
  ]);

  const bind = useDrag(({ args: [key], active, xy, movement }) => {
    const dragTileIndex = tiles.findIndex((tile) => tile.key === key);
    const dragTile = tiles[dragTileIndex];
    const dragTilePosition = tilePositions[dragTileIndex];

    let newTiles = tiles;

    const cursorPosition = [xy[0] - gridBounds.left, xy[1] - gridBounds.top];

    for (
      let hoverTileIndex = 0;
      hoverTileIndex < tiles.length;
      hoverTileIndex++
    ) {
      const hoverTile = tiles[hoverTileIndex];
      const hoverTilePosition = tilePositions[hoverTileIndex];

      if (hoverTile.key === key) {
        continue;
      }

      if (isInside(cursorPosition, hoverTilePosition)) {
        newTiles = moveArrItem(tiles, dragTileIndex, hoverTileIndex);
        setTileState((state) => ({ ...state, tiles: newTiles }));
        break;
      }
    }

    if (active) {
      if (!draggingTileRef.current) {
        draggingTileRef.current = {
          key: dragTile.key,
          offsetX: dragTilePosition.x,
          offsetY: dragTilePosition.y,
        };
      }

      draggingTileRef.current.x = movement[0];
      draggingTileRef.current.y = movement[1];
    } else {
      draggingTileRef.current = null;
    }

    api.start(animate(newTiles));
  });

  return (
    <div className={styles.grid} ref={gridRef}>
      {springs.map(({ shadow, ...style }, i) => {
        const tile = tiles[i];

        return (
          <ParticipantTile
            {...bind(tile.key)}
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
  );
}

function ParticipantTile({ style, participant, remove, ...rest }) {
  const videoRef = useRef();

  useEffect(() => {
    if (participant.stream) {
      videoRef.current.srcObject = participant.stream;
      videoRef.current.play();
    } else {
      videoRef.current.srcObject = null;
    }
  }, [participant.stream]);

  return (
    <animated.div className={styles.participantTile} style={style} {...rest}>
      <div className={styles.participantName}>{participant.userId}</div>
      <video ref={videoRef} playsInline />
    </animated.div>
  );
}
