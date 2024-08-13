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
}

export const CompatPip: FC<Props> = ({ className, video }) => {
  const showPlaceholder = video?.publication === undefined;
  const placeholderRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLVideoElement | null>(null);
  const placeholderLoaded = useRef(false);
  const trackLoaded = useRef<TrackReferenceOrPlaceholder | null>(null);

  const update = useCallback(() => {
    if (showPlaceholder) {
      if (placeholderLoaded.current)
        placeholderRef.current!.webkitSetPresentationMode("picture-in-picture");
    } else {
      if (trackLoaded.current)
        trackRef.current!.webkitSetPresentationMode("picture-in-picture");
    }
  }, [showPlaceholder]);

  useEffect(() => {
    trackLoaded.current = null;
  }, [video]);
  useEffect(() => update(), [update]);
  useEffect(() => {
    const placeholder = placeholderRef.current!;
    const track = trackRef.current!;
    return (): void => {
      placeholder.webkitSetPresentationMode("inline");
      track.webkitSetPresentationMode("inline");
    };
  });

  const onPlaceholderLoaded = useCallback(() => {
    placeholderLoaded.current = true;
    update();
  }, [update]);

  const onTrackLoaded = useCallback(() => {
    trackLoaded.current = video;
    update();
  }, [video, update]);

  return (
    <>
      <video
        ref={placeholderRef}
        className={classNames(className, { [styles.hidden]: !showPlaceholder })}
        src="/public/speaker-without-video.webm"
        playsInline
        onLoadedMetadata={onPlaceholderLoaded}
      />
      {!showPlaceholder && (
        <VideoTrack
          ref={trackRef}
          className={className}
          trackRef={video}
          // There's no reason for this to be focusable
          tabIndex={-1}
          onLoadedMetadata={onTrackLoaded}
        />
      )}
    </>
  );
};
