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

import { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { VideoTrack } from "@livekit/components-react";
import classNames from "classnames";
import { FC, useCallback, useEffect, useRef } from "react";

import styles from "./CompatPip.module.css";

interface Props {
  className?: string;
  video: TrackReferenceOrPlaceholder | null;
  onExit: () => void;
}

export const CompatPip: FC<Props> = ({ className, video, onExit }) => {
  const showPlaceholder = video?.publication === undefined;
  const placeholderRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLVideoElement | null>(null);
  const placeholderLoaded = useRef(false);
  const trackLoaded = useRef<TrackReferenceOrPlaceholder | null>(null);

  const update = useCallback(() => {
    if (!placeholderLoaded.current) return;
    if (!showPlaceholder && trackLoaded.current)
      trackRef.current!.webkitSetPresentationMode("picture-in-picture");
    else
      placeholderRef.current!.webkitSetPresentationMode("picture-in-picture");
  }, [showPlaceholder]);

  useEffect(() => {
    trackLoaded.current = null;
    update();
  }, [video, update]);

  useEffect(() => {
    const placeholder = placeholderRef.current!;
    const track = trackRef.current!;

    const onPlaceholderModeChange = (): void => {
      if (placeholder.webkitPresentationMode === "inline") onExit();
    };
    const onTrackModeChange = (): void => {
      if (track.webkitPresentationMode === "inline") onExit();
    };

    placeholder.addEventListener(
      "webkitpresentationmodechange",
      onPlaceholderModeChange,
    );
    track.addEventListener("webkitpresentationmodechange", onTrackModeChange);

    return (): void => {
      placeholder.removeEventListener(
        "webkitpresentationmodechange",
        onPlaceholderModeChange,
      );
      track.removeEventListener(
        "webkitpresentationmodechange",
        onTrackModeChange,
      );
      placeholder.webkitSetPresentationMode("inline");
      track.webkitSetPresentationMode("inline");
    };
  });

  const onPlaceholderLoaded = useCallback(() => {
    placeholderLoaded.current = true;
    update();
  }, [update]);

  const onPlaceholderPlay = useCallback(() => {
    placeholderRef.current!.pause();
  }, []);

  const onTrackLoaded = useCallback(() => {
    trackLoaded.current = video;
    update();
  }, [video, update]);

  const onTrackPause = useCallback(() => {
    trackRef.current!.play();
  }, []);

  return (
    <>
      <video
        ref={placeholderRef}
        className={classNames(className, { [styles.hidden]: !showPlaceholder })}
        src="/speaker-without-video.webm"
        controls={false}
        playsInline
        onLoadedMetadata={onPlaceholderLoaded}
        onPlay={onPlaceholderPlay}
      />
      {!showPlaceholder && (
        <VideoTrack
          ref={trackRef}
          className={className}
          trackRef={video}
          // There's no reason for this to be focusable
          tabIndex={-1}
          onLoadedMetadata={onTrackLoaded}
          onPause={onTrackPause}
        />
      )}
    </>
  );
};
