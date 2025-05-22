/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { type CallMembership } from "matrix-js-sdk/lib/matrixrtc";
import {
  getTrackReferenceId,
  type TrackReference,
} from "@livekit/components-core";
import { type RemoteAudioTrack } from "livekit-client";
import { type ReactNode } from "react";
import { useTracks } from "@livekit/components-react";

import { testAudioContext } from "../useAudioContext.test";
import * as MediaDevicesContext from "./MediaDevicesContext";
import { MatrixAudioRenderer } from "./MatrixAudioRenderer";
import { mockTrack } from "../utils/test";

export const TestAudioContextConstructor = vi.fn(() => testAudioContext);

beforeEach(() => {
  vi.stubGlobal("AudioContext", TestAudioContextConstructor);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

vi.mock("@livekit/components-react", async (importOriginal) => {
  return {
    ...(await importOriginal()),
    AudioTrack: (props: { trackRef: TrackReference }): ReactNode => {
      return (
        <audio data-testid={"audio"}>
          {getTrackReferenceId(props.trackRef)}
        </audio>
      );
    },
    useTracks: vi.fn(),
  };
});

const tracks = [mockTrack("test:123")];
vi.mocked(useTracks).mockReturnValue(tracks);

it("should render for member", () => {
  const { container, queryAllByTestId } = render(
    <MatrixAudioRenderer
      members={[{ sender: "test", deviceId: "123" }] as CallMembership[]}
    />,
  );
  expect(container).toBeTruthy();
  expect(queryAllByTestId("audio")).toHaveLength(1);
});
it("should not render without member", () => {
  const { container, queryAllByTestId } = render(
    <MatrixAudioRenderer
      members={[{ sender: "othermember", deviceId: "123" }] as CallMembership[]}
    />,
  );
  expect(container).toBeTruthy();
  expect(queryAllByTestId("audio")).toHaveLength(0);
});

it("should not setup audioContext gain and pan if there is no need to.", () => {
  render(
    <MatrixAudioRenderer
      members={[{ sender: "test", deviceId: "123" }] as CallMembership[]}
    />,
  );
  const audioTrack = tracks[0].publication.track! as RemoteAudioTrack;

  expect(audioTrack.setAudioContext).toHaveBeenCalledTimes(1);
  expect(audioTrack.setAudioContext).toHaveBeenCalledWith(undefined);
  expect(audioTrack.setWebAudioPlugins).toHaveBeenCalledTimes(1);
  expect(audioTrack.setWebAudioPlugins).toHaveBeenCalledWith([]);

  expect(testAudioContext.gain.gain.value).toEqual(1);
  expect(testAudioContext.pan.pan.value).toEqual(0);
});
it("should setup audioContext gain and pan", () => {
  vi.spyOn(MediaDevicesContext, "useEarpieceAudioConfig").mockReturnValue({
    pan: 1,
    volume: 0.1,
  });
  render(
    <MatrixAudioRenderer
      members={[{ sender: "test", deviceId: "123" }] as CallMembership[]}
    />,
  );

  const audioTrack = tracks[0].publication.track! as RemoteAudioTrack;
  expect(audioTrack.setAudioContext).toHaveBeenCalled();
  expect(audioTrack.setWebAudioPlugins).toHaveBeenCalled();

  expect(testAudioContext.gain.gain.value).toEqual(0.1);
  expect(testAudioContext.pan.pan.value).toEqual(1);
});
