/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  getTrackReferenceId,
  type TrackReference,
} from "@livekit/components-core";
import { type RemoteAudioTrack } from "livekit-client";
import { type ReactNode } from "react";
import { useTracks } from "@livekit/components-react";
import { of } from "rxjs";

import { testAudioContext } from "../useAudioContext.test";
import * as MediaDevicesContext from "../MediaDevicesContext";
import { LivekitRoomAudioRenderer } from "./MatrixAudioRenderer";
import {
  mockLivekitRoom,
  mockMatrixRoomMember,
  mockMediaDevices,
  mockRtcMembership,
  mockTrack
} from "../utils/test";


export const TestAudioContextConstructor = vi.fn(() => testAudioContext);

const MediaDevicesProvider = MediaDevicesContext.MediaDevicesContext.Provider;

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
  // TODO this is duplicated test setup in all tests
  const localRtcMember = mockRtcMembership("@carol:example.org", "CCCC");
  const carol = mockMatrixRoomMember(localRtcMember);
  const p = {
    id: "test:123",
    participant: undefined,
    member: carol
  }
  const livekitRoom = mockLivekitRoom(
    {},
    {
      remoteParticipants$: of([]),
    },
  );
  const { container, queryAllByTestId } = render(
    <MediaDevicesProvider value={mockMediaDevices({})}>
      <LivekitRoomAudioRenderer
        participants={[p]}
        livekitRoom={livekitRoom}
        url={""}
      />
    </MediaDevicesProvider>,
  );
  expect(container).toBeTruthy();
  expect(queryAllByTestId("audio")).toHaveLength(1);
});

it("should not render without member", () => {
  // const memberships = [
  //   { sender: "othermember", deviceId: "123" },
  // ] as CallMembership[];
  const localRtcMember = mockRtcMembership("@carol:example.org", "CCCC");
  const carol = mockMatrixRoomMember(localRtcMember);
  const p = {
    id: "test:123",
    participant: undefined,
    member: carol
  }
  const livekitRoom = mockLivekitRoom(
    {},
    {
      remoteParticipants$: of([]),
    },
  );
  const { container, queryAllByTestId } = render(
    <MediaDevicesProvider value={mockMediaDevices({})}>
      <LivekitRoomAudioRenderer
        participants={[p]}
        livekitRoom={livekitRoom}
        url={""}
      />
    </MediaDevicesProvider>,
  );
  expect(container).toBeTruthy();
  expect(queryAllByTestId("audio")).toHaveLength(0);
});

it("should not setup audioContext gain and pan if there is no need to.", () => {
  const localRtcMember = mockRtcMembership("@carol:example.org", "CCCC");
  const carol = mockMatrixRoomMember(localRtcMember);
  const p = {
    id: "test:123",
    participant: undefined,
    member: carol
  }
  const livekitRoom = mockLivekitRoom(
    {},
    {
      remoteParticipants$: of([]),
    },
  );
  render(
    <MediaDevicesProvider value={mockMediaDevices({})}>
      <LivekitRoomAudioRenderer
        participants={[p]}
        livekitRoom={livekitRoom}
        url={""}
      />
    </MediaDevicesProvider>,
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
  const localRtcMember = mockRtcMembership("@carol:example.org", "CCCC");
  const carol = mockMatrixRoomMember(localRtcMember);
  const p = {
    id: "test:123",
    participant: undefined,
    member: carol
  }
  const livekitRoom = mockLivekitRoom(
    {},
    {
      remoteParticipants$: of([]),
    },
  );
  render(
    <MediaDevicesProvider value={mockMediaDevices({})}>
      <LivekitRoomAudioRenderer
        participants={[p]}
        url={""}
        livekitRoom={livekitRoom}      />
    </MediaDevicesProvider>,
  );

  const audioTrack = tracks[0].publication.track! as RemoteAudioTrack;
  expect(audioTrack.setAudioContext).toHaveBeenCalled();
  expect(audioTrack.setWebAudioPlugins).toHaveBeenCalled();

  expect(testAudioContext.gain.gain.value).toEqual(0.1);
  expect(testAudioContext.pan.pan.value).toEqual(1);
});
