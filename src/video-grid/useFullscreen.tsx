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

import { useCallback, useEffect, useState } from "react";

import { Participant } from "../room/InCallView";
import { useEventTarget } from "../useEvents";
import { useCallFeed } from "./useCallFeed";

export function useFullscreen(ref: React.RefObject<HTMLElement>): {
  toggleFullscreen: (participant: Participant) => void;
  fullscreenParticipant: Participant | null;
} {
  const [fullscreenParticipant, setFullscreenParticipant] =
    useState<Participant | null>(null);
  const { disposed } = useCallFeed(fullscreenParticipant?.callFeed);

  const toggleFullscreen = useCallback(
    (participant: Participant) => {
      if (fullscreenParticipant) {
        document.exitFullscreen().catch((e) => console.error(e));
        setFullscreenParticipant(null);
      } else {
        try {
          ref.current.requestFullscreen();
          setFullscreenParticipant(participant);
        } catch (error) {
          console.warn("Failed to fullscreen:", error);
        }
      }
    },
    [fullscreenParticipant, setFullscreenParticipant, ref]
  );

  const onFullscreenChanged = useCallback(() => {
    if (!document.fullscreenElement) {
      setFullscreenParticipant(null);
    }
  }, [setFullscreenParticipant]);

  useEventTarget(ref.current, "fullscreenchange", onFullscreenChanged);

  useEffect(() => {
    if (disposed) {
      document.exitFullscreen().catch((e) => console.error(e));
      setFullscreenParticipant(null);
    }
  }, [disposed]);

  return { toggleFullscreen, fullscreenParticipant };
}
