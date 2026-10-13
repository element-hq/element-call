/*
Copyright 2025 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type AudioMediaTrack,
  type MemberMedia,
  type RemoteRTCMember,
} from "@element-hq/matrixrtc-sdk";
import { type FC, useEffect, useMemo, useState } from "react";

import { useEarpieceAudioConfig } from "../MediaDevicesContext";
import { useBehavior } from "../useBehavior";
import * as controls from "../controls";

export interface MemberAudioRendererProps {
  /** The remote members whose audio should be heard; never the local one. */
  members: RemoteRTCMember[];
  /**
   * If set to `true`, mutes every audio track.
   * @remarks
   * If set to `true`, the server will stop sending audio track data to the client.
   */
  muted?: boolean;
}

/**
 * Plays every remote member's microphone and screen share audio, one audio
 * element per track. Only members of the session reach here, so anything
 * else that publishes on the transport stays inaudible.
 *
 * It also takes care of the earpiece audio configuration for iOS devices.
 * This is done by using the WebAudio API to create a stereo pan effect that
 * mimics the earpiece audio.
 */
export const MemberAudioRenderer: FC<MemberAudioRendererProps> = ({
  members,
  muted,
}) => {
  // This component is also (in addition to the "only play audio for session
  // members" logic above) responsible for mimicking earpiece audio on iPhones.
  // The Safari audio devices enumeration does not expose an earpiece audio device.
  // We alternatively use the audioContext pan node to only use one of the stereo channels.

  // This component does get additionally complicated because of a Safari bug.
  // (see: https://bugs.webkit.org/show_bug.cgi?id=251532
  // and the related issues: https://bugs.webkit.org/show_bug.cgi?id=237878
  // and https://bugs.webkit.org/show_bug.cgi?id=231105)
  //
  // AudioContext gets stopped if the webview gets moved into the background.
  // Once the phone is in standby audio playback will stop.
  // So we can only use the pan trick only works is the phone is not in standby.
  // If earpiece mode is not used we do not use audioContext to allow standby playback.
  // shouldUseAudioContext is set to false if stereoPan === 0 to allow standby bluetooth playback.

  const { pan: stereoPan, volume: volumeFactor } = useEarpieceAudioConfig();
  const shouldUseAudioContext = stereoPan !== 0;

  // initialize the potentially used audio context.
  const [audioContext, setAudioContext] = useState<AudioContext | undefined>(
    undefined,
  );
  useEffect(() => {
    const ctx = new AudioContext();
    setAudioContext(ctx);
    return (): void => {
      void ctx.close();
    };
  }, []);
  const audioNodes = useMemo(
    () => ({
      gain: audioContext?.createGain(),
      pan: audioContext?.createStereoPanner(),
    }),
    [audioContext],
  );

  // Simple effects to update the gain and pan node based on the props
  useEffect(() => {
    if (audioNodes.pan) audioNodes.pan.pan.value = stereoPan;
  }, [audioNodes.pan, stereoPan]);
  useEffect(() => {
    if (audioNodes.gain) audioNodes.gain.gain.value = volumeFactor;
  }, [audioNodes.gain, volumeFactor]);

  const plugins = useMemo(
    () =>
      shouldUseAudioContext && audioNodes.gain && audioNodes.pan
        ? { context: audioContext, nodes: [audioNodes.gain, audioNodes.pan] }
        : { context: undefined, nodes: [] },
    [shouldUseAudioContext, audioContext, audioNodes],
  );

  return (
    // We add all audio elements into one <div> for the browser developer tool experience/tidyness.
    <div style={{ display: "none" }}>
      {members.map((member) => (
        <MemberAudio
          key={member.id}
          media$={member.media$}
          muted={muted}
          plugins={plugins}
        />
      ))}
    </div>
  );
};

interface AudioPlugins {
  context: AudioContext | undefined;
  nodes: AudioNode[];
}

const MemberAudio: FC<{
  media$: RemoteRTCMember["media$"];
  muted?: boolean;
  plugins: AudioPlugins;
}> = ({ media$, muted, plugins }) => {
  const media = useBehavior(media$);
  return (
    media !== null && (
      <>
        <AudioTrack
          track$={media.microphone$}
          muted={muted}
          plugins={plugins}
        />
        <AudioTrack
          track$={media.screenShareAudio$}
          muted={muted}
          plugins={plugins}
        />
      </>
    )
  );
};

const AudioTrack: FC<{
  track$: MemberMedia["microphone$"];
  muted?: boolean;
  plugins: AudioPlugins;
}> = ({ track$, muted, plugins }) => {
  const track = useBehavior(track$);
  return (
    track !== undefined && (
      <TrackAudio track={track} muted={muted} plugins={plugins} />
    )
  );
};

/**
 * One audio element, handed to the SDK to play on. The Web Audio graph for the
 * earpiece is applied before the element so that playback starts through it.
 */
const TrackAudio: FC<{
  track: AudioMediaTrack;
  muted?: boolean;
  plugins: AudioPlugins;
}> = ({ track, muted, plugins }) => {
  const [element, setElement] = useState<HTMLAudioElement | null>(null);
  useEffect(() => {
    track.setAudioContext(plugins.context, plugins.nodes);
  }, [track, plugins]);
  useEffect(() => {
    if (element === null) return;
    track.attach(element);
    controls.setPlaybackStarted();
    return (): void => track.detach(element);
  }, [track, element]);
  // A live microphone has no captions to offer
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <audio ref={setElement} muted={muted} data-testid="audio" />;
};
