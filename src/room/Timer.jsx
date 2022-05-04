import React, { useEffect, useState } from "react";

function leftPad(value) {
  return value < 10 ? "0" + value : value;
}

function formatTime(msElapsed) {
  const secondsElapsed = msElapsed / 1000;
  const hours = Math.floor(secondsElapsed / 3600);
  const minutes = Math.floor(secondsElapsed / 60) - hours * 60;
  const seconds = Math.floor(secondsElapsed - hours * 3600 - minutes * 60);
  return `${leftPad(hours)}:${leftPad(minutes)}:${leftPad(seconds)}`;
}

export function Timer({ value }) {
  const [timestamp, setTimestamp] = useState();

  useEffect(() => {
    const startTimeMs = performance.now();

    let animationFrame;

    function onUpdate(curTimeMs) {
      const msElapsed = curTimeMs - startTimeMs;
      setTimestamp(formatTime(msElapsed));
      animationFrame = requestAnimationFrame(onUpdate);
    }

    onUpdate(startTimeMs);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [value]);

  return <p>{timestamp}</p>;
}
