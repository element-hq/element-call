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

import React, { useEffect, useState } from "react";

function leftPad(value: number): string {
  return value < 10 ? "0" + value : "" + value;
}

function formatTime(msElapsed: number): string {
  const secondsElapsed = msElapsed / 1000;
  const hours = Math.floor(secondsElapsed / 3600);
  const minutes = Math.floor(secondsElapsed / 60) - hours * 60;
  const seconds = Math.floor(secondsElapsed - hours * 3600 - minutes * 60);
  return `${leftPad(hours)}:${leftPad(minutes)}:${leftPad(seconds)}`;
}

export function Timer({ value }: { value: string }) {
  const [timestamp, setTimestamp] = useState<string>();

  useEffect(() => {
    const startTimeMs = performance.now();

    let animationFrame: number;

    function onUpdate(curTimeMs: number) {
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
