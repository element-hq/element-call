/* eslint-disable */
// The contents of this file below the line are copied from
// @types/dom-mediacapture-transform, which is inlined here into Element Call so
// that we can apply the patch to @types/dom-webcodecs found in
// ./dom-webcodecs.d.ts, which it depends on.
// (https://github.com/DefinitelyTyped/DefinitelyTyped/pull/72625)
// Once that PR is merged and released, we can remove this file and return to
// depending on @types/dom-mediacapture-transform.
// -----------------------------------------------------------------------------

// This project is licensed under the MIT license.
// Copyrights are respective of each contributor listed at the beginning of each definition file.

// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// In general, these types are only available behind a command line flag or an origin trial in
// Chrome 90+.

// This API depends on WebCodecs.

// Versioning:
// Until the above-mentioned spec is finalized, the major version number is 0. Although not
// necessary for version 0, consider incrementing the minor version number for breaking changes.

// The following modify existing DOM types to allow defining type-safe APIs on audio and video tracks.

/** Specialize MediaStreamTrack so that we can refer specifically to an audio track. */
interface MediaStreamAudioTrack extends MediaStreamTrack {
  readonly kind: "audio";
  clone(): MediaStreamAudioTrack;
}

/** Specialize MediaStreamTrack so that we can refer specifically to a video track. */
interface MediaStreamVideoTrack extends MediaStreamTrack {
  readonly kind: "video";
  clone(): MediaStreamVideoTrack;
}

/** Assert that getAudioTracks and getVideoTracks return the tracks with the appropriate kind. */
interface MediaStream {
  getAudioTracks(): MediaStreamAudioTrack[];
  getVideoTracks(): MediaStreamVideoTrack[];
}

// The following were originally generated from the spec using
// https://github.com/microsoft/TypeScript-DOM-lib-generator, then heavily modified.

/**
 * A track sink that is capable of exposing the unencoded frames from the track to a
 * ReadableStream, and exposes a control channel for signals going in the oppposite direction.
 */
interface MediaStreamTrackProcessor<T extends AudioData | VideoFrame> {
  /**
   * Allows reading the frames flowing through the MediaStreamTrack provided to the constructor.
   */
  readonly readable: ReadableStream<T>;
  /** Allows sending control signals to the MediaStreamTrack provided to the constructor. */
  readonly writableControl: WritableStream<MediaStreamTrackSignal>;
}

declare var MediaStreamTrackProcessor: {
  prototype: MediaStreamTrackProcessor<any>;

  /** Constructor overrides based on the type of track. */
  new (
    init: MediaStreamTrackProcessorInit & { track: MediaStreamAudioTrack },
  ): MediaStreamTrackProcessor<AudioData>;
  new (
    init: MediaStreamTrackProcessorInit & { track: MediaStreamVideoTrack },
  ): MediaStreamTrackProcessor<VideoFrame>;
};

interface MediaStreamTrackProcessorInit {
  track: MediaStreamTrack;
  /**
   * If media frames are not read from MediaStreamTrackProcessor.readable quickly enough, the
   * MediaStreamTrackProcessor will internally buffer up to maxBufferSize of the frames produced
   * by the track. If the internal buffer is full, each time the track produces a new frame, the
   * oldest frame in the buffer will be dropped and the new frame will be added to the buffer.
   */
  maxBufferSize?: number | undefined;
}

/**
 * Takes video frames as input, and emits control signals that result from subsequent processing.
 */
interface MediaStreamTrackGenerator<T extends AudioData | VideoFrame>
  extends MediaStreamTrack {
  /**
   * Allows writing media frames to the MediaStreamTrackGenerator, which is itself a
   * MediaStreamTrack. When a frame is written to writable, the frame’s close() method is
   * automatically invoked, so that its internal resources are no longer accessible from
   * JavaScript.
   */
  readonly writable: WritableStream<T>;
  /**
   * Allows reading control signals sent from any sinks connected to the
   * MediaStreamTrackGenerator.
   */
  readonly readableControl: ReadableStream<MediaStreamTrackSignal>;
}

type MediaStreamAudioTrackGenerator = MediaStreamTrackGenerator<AudioData> &
  MediaStreamAudioTrack;
type MediaStreamVideoTrackGenerator = MediaStreamTrackGenerator<VideoFrame> &
  MediaStreamVideoTrack;

declare var MediaStreamTrackGenerator: {
  prototype: MediaStreamTrackGenerator<any>;

  /** Constructor overrides based on the type of track. */
  new (
    init: MediaStreamTrackGeneratorInit & {
      kind: "audio";
      signalTarget?: MediaStreamAudioTrack | undefined;
    },
  ): MediaStreamAudioTrackGenerator;
  new (
    init: MediaStreamTrackGeneratorInit & {
      kind: "video";
      signalTarget?: MediaStreamVideoTrack | undefined;
    },
  ): MediaStreamVideoTrackGenerator;
};

interface MediaStreamTrackGeneratorInit {
  kind: MediaStreamTrackGeneratorKind;
  /**
   * (Optional) track to which the MediaStreamTrackGenerator will automatically forward control
   * signals. If signalTarget is provided and signalTarget.kind and kind do not match, the
   * MediaStreamTrackGenerator’s constructor will raise an exception.
   */
  signalTarget?: MediaStreamTrack | undefined;
}

type MediaStreamTrackGeneratorKind = "audio" | "video";

type MediaStreamTrackSignalType = "request-frame";

interface MediaStreamTrackSignal {
  signalType: MediaStreamTrackSignalType;
}
