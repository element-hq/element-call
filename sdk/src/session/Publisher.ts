/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ConnectionState as LivekitConnectionState,
  type LocalTrackPublication,
  ParticipantEvent,
  type Room as LivekitRoom,
  Track,
} from "livekit-client";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { type BehaviorSubject } from "rxjs";

import { ObservableScope } from "../reactive/ObservableScope";
import { type LocalMediaInputs } from "../api";

/** What the host last asked for, kept across publishers. */
export interface DesiredMedia {
  microphone$: BehaviorSubject<boolean>;
  camera$: BehaviorSubject<boolean>;
}

/**
 * Publishes the local media on one LiveKit room, following the host's
 * requests.
 *
 * LiveKit publishes a track the moment it is created, but a member must not be
 * heard before it has joined the MatrixRTC session, nor after it has left. The
 * tracks are therefore kept, and their upstream paused, while `shouldPublish`
 * is false: the local preview stays live while nothing reaches the room.
 */
export class Publisher {
  public shouldPublish = false;
  private tracksRequested = false;
  private readonly scope = new ObservableScope();
  private readonly room: LivekitRoom;

  public constructor(
    room: LivekitRoom,
    private readonly inputs: LocalMediaInputs,
    private readonly desired: DesiredMedia,
    private readonly logger: Logger,
  ) {
    this.room = room;
    room.setE2EEEnabled(room.options.e2ee !== undefined)?.catch((e: Error) => {
      this.logger.error("Failed to enable E2EE on the room", e);
    });
    this.followAudioOutput();
    this.onLocalTrackPublished = this.onLocalTrackPublished.bind(this);
    room.localParticipant.on(
      ParticipantEvent.LocalTrackPublished,
      this.onLocalTrackPublished,
    );
  }

  public async destroy(): Promise<void> {
    this.scope.end();
    this.room.localParticipant.off(
      ParticipantEvent.LocalTrackPublished,
      this.onLocalTrackPublished,
    );
    try {
      await this.stopTracks();
    } catch (e) {
      this.logger.error("Failed to stop the local tracks", e);
    }
  }

  /**
   * Creates the microphone and camera tracks the host asked for. Both are
   * enabled in one call so that the browser asks for permission once. Safe to
   * call more than once.
   */
  public createAndSetupTracks(): void {
    if (this.tracksRequested) return;
    this.tracksRequested = true;
    const participant = this.room.localParticipant;
    const audio = this.desired.microphone$.value;
    const video = this.desired.camera$.value;
    // LiveKit resolves these once the track is published, which may block on
    // the connection; LocalTrackPublished is what tells us a track exists.
    if (audio && video) void participant.enableCameraAndMicrophone();
    else if (audio) void participant.setMicrophoneEnabled(true);
    else if (video) void participant.setCameraEnabled(true);
  }

  /**
   * Enables or disables a source and reports what resulted: the request where
   * it succeeded, the state LiveKit is left in where it did not (a denied
   * permission, a missing device).
   */
  public async setEnabled(
    source: Track.Source.Microphone | Track.Source.Camera,
    enabled: boolean,
  ): Promise<boolean> {
    const participant = this.room.localParticipant;
    try {
      if (source === Track.Source.Microphone)
        await participant.setMicrophoneEnabled(enabled);
      else await participant.setCameraEnabled(enabled);
      // Unmuting restarts the upstream; until the member has joined, it has
      // to stay paused
      if (enabled && !this.shouldPublish) await this.pauseUpstreams([source]);
      return enabled;
    } catch (e) {
      this.logger.error(`Failed to set ${source} enabled=${enabled}`, e);
      return source === Track.Source.Microphone
        ? participant.isMicrophoneEnabled
        : participant.isCameraEnabled;
    }
  }

  public async startPublishing(): Promise<void> {
    if (this.shouldPublish) return;
    this.shouldPublish = true;
    // Enabling a track does not resume an upstream that was paused while it
    // was already enabled, so it is done explicitly
    await this.resumeUpstreams([Track.Source.Microphone, Track.Source.Camera]);
  }

  public async stopPublishing(): Promise<void> {
    this.shouldPublish = false;
    await this.pauseUpstreams([
      Track.Source.Microphone,
      Track.Source.Camera,
      Track.Source.ScreenShare,
    ]);
  }

  private async stopTracks(): Promise<void> {
    const participant = this.room.localParticipant;
    for (const source of [
      Track.Source.Microphone,
      Track.Source.Camera,
      Track.Source.ScreenShare,
    ]) {
      const track = participant.getTrackPublication(source)?.track;
      if (track) await participant.unpublishTrack(track, true);
    }
  }

  private onLocalTrackPublished(publication: LocalTrackPublication): void {
    this.logger.info(`Local ${publication.source} track published`);
    if (!this.shouldPublish)
      this.pauseUpstreams([publication.source]).catch((e) => {
        this.logger.error("Failed to pause the upstream", e);
      });
    // The host may have changed its mind while the track was being created
    const desired =
      publication.source === Track.Source.Microphone
        ? this.desired.microphone$.value
        : publication.source === Track.Source.Camera
          ? this.desired.camera$.value
          : undefined;
    if (desired === false)
      void this.setEnabled(
        publication.source as Track.Source.Microphone | Track.Source.Camera,
        false,
      );
  }

  private async pauseUpstreams(sources: Track.Source[]): Promise<void> {
    for (const source of sources) {
      const track =
        this.room.localParticipant.getTrackPublication(source)?.track;
      if (track && !track.isUpstreamPaused) await track.pauseUpstream();
    }
  }

  private async resumeUpstreams(sources: Track.Source[]): Promise<void> {
    for (const source of sources) {
      const track =
        this.room.localParticipant.getTrackPublication(source)?.track;
      if (track?.isUpstreamPaused) await track.resumeUpstream();
    }
  }

  private followAudioOutput(): void {
    this.inputs.audioOutputDeviceId$
      .pipe(this.scope.bind())
      .subscribe((deviceId) => {
        if (
          deviceId === undefined ||
          this.room.state !== LivekitConnectionState.Connected ||
          this.room.getActiveDevice("audiooutput") === deviceId
        )
          return;
        this.room
          .switchActiveDevice("audiooutput", deviceId)
          .catch((e) => this.logger.error("Failed to switch audiooutput", e));
      });
  }
}
