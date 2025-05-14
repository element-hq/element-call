/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { getTrackReferenceId } from "@livekit/components-core";
import { type RemoteAudioTrack, Track } from "livekit-client";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  useTracks,
  AudioTrack,
  type AudioTrackProps,
} from "@livekit/components-react";
import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import { logger } from "matrix-js-sdk/lib/logger";

import { useEarpieceAudioConfig } from "./MediaDevicesContext";
import { useReactiveState } from "../useReactiveState";

export interface MatrixAudioRendererProps {
  /**
   * The list of participants to render audio for.
   * This list needs to be composed based on the matrixRTC members so that we do not play audio from users
   * that are not expected to be in the rtc session.
   */
  members: CallMembership[];
  /**
   * If set to `true`, mutes all audio tracks rendered by the component.
   * @remarks
   * If set to `true`, the server will stop sending audio track data to the client.
   */
  muted?: boolean;
}

/**
 * The `MatrixAudioRenderer` component is a drop-in solution for adding audio to your LiveKit app.
 * It takes care of handling remote participants’ audio tracks and makes sure that microphones and screen share are audible.
 *
 * It also takes care of the earpiece audio configuration for iOS devices.
 * This is done by using the WebAudio API to create a stereo pan effect that mimics the earpiece audio.
 * @example
 * ```tsx
 * <LiveKitRoom>
 *   <MatrixAudioRenderer />
 * </LiveKitRoom>
 * ```
 * @public
 */
export function MatrixAudioRenderer({
  members,
  muted,
}: MatrixAudioRendererProps): ReactNode {
  const validIdentities = useMemo(
    () =>
      new Set(members?.map((member) => `${member.sender}:${member.deviceId}`)),
    [members],
  );

  const loggedInvalidIdentities = useRef(new Set<string>());
  /**
   * Log an invalid livekit track identity.
   * A invalid identity is one that does not match any of the matrix rtc members.
   *
   * @param identity The identity of the track that is invalid
   * @param validIdentities The list of valid identities
   */
  const logInvalid = (identity: string, validIdentities: Set<string>): void => {
    if (loggedInvalidIdentities.current.has(identity)) return;
    logger.warn(
      `Audio track ${identity} has no matching matrix call member`,
      `current members: ${Array.from(validIdentities.values())}`,
      `track will not get rendered`,
    );
    loggedInvalidIdentities.current.add(identity);
  };

  const tracks = useTracks(
    [
      Track.Source.Microphone,
      Track.Source.ScreenShareAudio,
      Track.Source.Unknown,
    ],
    {
      updateOnlyOn: [],
      onlySubscribed: true,
    },
  ).filter((ref) => {
    const isValid = validIdentities?.has(ref.participant.identity);
    if (!isValid) logInvalid(ref.participant.identity, validIdentities);
    return (
      !ref.participant.isLocal &&
      ref.publication.kind === Track.Kind.Audio &&
      isValid
    );
  });

  // This component is also (in addition to the "only play audio for connected members" logic above)
  // to mimic earpice audio on iphones.
  // The safari audio devices enumeration does not expose an earpice audio device.
  // We alternatively use the audioContext pan node to only use one of the stereo channels.

  // This component does get additionally complicated because of a safari bug.
  // (see: https://bugs.webkit.org/show_bug.cgi?id=251532
  // and the related issues: https://bugs.webkit.org/show_bug.cgi?id=237878
  // and https://bugs.webkit.org/show_bug.cgi?id=231105)
  //
  // AudioContext gets stopped if the webview gets moved into the background.
  // Once the phone is in standby audio playback will stop.
  // So we can only use the pan trick only works is the phone is not in standby.
  // If earpice mode is not used we do not use audioContext to allow standby playback.
  // shouldUseAudioContext is set to false if stereoPan === 0 to allow standby bluetooth playback.

  const { pan: stereoPan, volume: volumeFactor } = useEarpieceAudioConfig();
  const shouldUseAudioContext = stereoPan !== 0;

  // initialize the potentially used audio context.
  const audioContext = useMemo(() => new AudioContext(), []);
  const audioNodes = useMemo(
    () => ({
      gain: audioContext.createGain(),
      pan: audioContext.createStereoPanner(),
    }),
    [audioContext],
  );

  // Simple effects to update the gain and pan node based on the props
  useEffect(() => {
    audioNodes.pan.pan.value = stereoPan;
  }, [audioNodes.pan.pan, stereoPan]);
  useEffect(() => {
    // *4 to balance the transition from audio context to normal audio playback.
    // probably needed due to gain behaving differently than el.volume
    audioNodes.gain.gain.value = volumeFactor;
  }, [audioNodes.gain.gain, volumeFactor]);

  return (
    // We add all audio elements into one <div> for the browser developer tool experience/tidyness.
    <div style={{ display: "none" }}>
      {tracks.map((trackRef) => (
        <AudioTrackWithAudioNodes
          key={getTrackReferenceId(trackRef)}
          trackRef={trackRef}
          muted={muted}
          audioContext={shouldUseAudioContext ? audioContext : undefined}
          audioNodes={audioNodes}
        />
      ))}
    </div>
  );
}

interface StereoPanAudioTrackProps {
  muted?: boolean;
  audioContext?: AudioContext;
  audioNodes: {
    gain: GainNode;
    pan: StereoPannerNode;
  };
}

/**
 * This wraps `livekit.AudioTrack` to allow adding audio nodes to a track.
 * It main purpose is to remount the AudioTrack component when switching from
 * audiooContext to normal audio playback.
 * As of now the AudioTrack component does not support adding audio nodes while being mounted.
 * @param param0
 * @returns
 */
function AudioTrackWithAudioNodes({
  trackRef,
  muted,
  audioContext,
  audioNodes,
  ...props
}: StereoPanAudioTrackProps &
  AudioTrackProps &
  React.RefAttributes<HTMLAudioElement>): ReactNode {
  // This is used to unmount/remount the AudioTrack component.
  // Mounting needs to happen after the audioContext is set.
  // (adding the audio context when already mounted did not work outside strict mode)
  const [trackReady, setTrackReady] = useReactiveState(
    () => false,
    [audioContext || audioNodes],
  );

  useEffect(() => {
    if (!trackRef || trackReady) return;
    const track = trackRef.publication.track as RemoteAudioTrack;
    track.setAudioContext(audioContext);
    track.setWebAudioPlugins(
      audioContext ? [audioNodes.gain, audioNodes.pan] : [],
    );
    setTrackReady(true);
  }, [audioContext, audioNodes, setTrackReady, trackReady, trackRef]);

  return (
    trackReady && <AudioTrack trackRef={trackRef} muted={muted} {...props} />
  );
}
