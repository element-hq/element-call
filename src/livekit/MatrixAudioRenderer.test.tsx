/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, type RenderResult } from "@testing-library/react";
import {
  getTrackReferenceId,
  type TrackReference,
} from "@livekit/components-core";
import {
  type Participant,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type Room,
} from "livekit-client";
import { type ReactNode } from "react";
import { useTracks } from "@livekit/components-react";

import { testAudioContext } from "../useAudioContext.test";
import * as MediaDevicesContext from "../MediaDevicesContext";
import { LivekitRoomAudioRenderer } from "./MatrixAudioRenderer";
import { mockMediaDevices, mockTrack } from "../utils/test";

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

let tracks: TrackReference[] = [];

/**
 * Render the test component with given rtc members and livekit participant identities.
 *
 * It is possible to have rtc members that are not in livekit (e.g. not yet joined) and vice versa.
 *
 * @param rtcMembers - Array of active rtc members with userId and deviceId.
 * @param livekitParticipantIdentities - Array of livekit participant (that are publishing).
 * */

function renderTestComponent(
  rtcMembers: { userId: string; deviceId: string }[],
  livekitParticipantIdentities: string[],
): RenderResult {
  const liveKitParticipants = livekitParticipantIdentities.map(
    (identity) =>
      ({
        identity,
      }) as unknown as RemoteParticipant,
  );
  const participants = rtcMembers.flatMap(({ userId, deviceId }) => {
    const p = liveKitParticipants.find(
      (p) => p.identity === `${userId}:${deviceId}`,
    );
    return p === undefined ? [] : [p];
  });
  const livekitRoom = {
    remoteParticipants: new Map<string, Participant>(
      liveKitParticipants.map((p) => [p.identity, p]),
    ),
  } as unknown as Room;

  tracks = participants.map((p) => mockTrack(p));

  vi.mocked(useTracks).mockReturnValue(tracks);
  return render(
    <MediaDevicesProvider value={mockMediaDevices({})}>
      <LivekitRoomAudioRenderer
        participants={participants}
        livekitRoom={livekitRoom}
        url={""}
      />
    </MediaDevicesProvider>,
  );
}

it("should render for member", () => {
  const { container, queryAllByTestId } = renderTestComponent(
    [{ userId: "@alice", deviceId: "DEV0" }],
    ["@alice:DEV0"],
  );
  expect(container).toBeTruthy();
  expect(queryAllByTestId("audio")).toHaveLength(1);
});

it("should not render without member", () => {
  const { container, queryAllByTestId } = renderTestComponent(
    [{ userId: "@bob", deviceId: "DEV0" }],
    ["@alice:DEV0"],
  );
  expect(container).toBeTruthy();
  expect(queryAllByTestId("audio")).toHaveLength(0);
});

const TEST_CASES: {
  rtcUsers: { userId: string; deviceId: string }[];
  livekitParticipantIdentities: string[];
  expectedAudioTracks: number;
}[] = [
  {
    rtcUsers: [
      { userId: "@alice", deviceId: "DEV0" },
      { userId: "@alice", deviceId: "DEV1" },
      { userId: "@bob", deviceId: "DEV0" },
    ],
    livekitParticipantIdentities: ["@alice:DEV0", "@bob:DEV0", "@alice:DEV1"],
    expectedAudioTracks: 3,
  },
  // Charlie is a rtc member but not in livekit
  {
    rtcUsers: [
      { userId: "@alice", deviceId: "DEV0" },
      { userId: "@bob", deviceId: "DEV0" },
      { userId: "@charlie", deviceId: "DEV0" },
    ],
    livekitParticipantIdentities: ["@alice:DEV0", "@bob:DEV0"],
    expectedAudioTracks: 2,
  },
  // Charlie is in livekit but not rtc member
  {
    rtcUsers: [
      { userId: "@alice", deviceId: "DEV0" },
      { userId: "@bob", deviceId: "DEV0" },
    ],
    livekitParticipantIdentities: ["@alice:DEV0", "@bob:DEV0", "@charlie:DEV0"],
    expectedAudioTracks: 2,
  },
];

TEST_CASES.forEach(
  ({ rtcUsers, livekitParticipantIdentities, expectedAudioTracks }, index) => {
    it(`should render sound test cases #${index + 1}`, () => {
      const { queryAllByTestId } = renderTestComponent(
        rtcUsers,
        livekitParticipantIdentities,
      );
      expect(queryAllByTestId("audio")).toHaveLength(expectedAudioTracks);
    });
  },
);

it("should not setup audioContext gain and pan if there is no need to.", () => {
  renderTestComponent([{ userId: "@bob", deviceId: "DEV0" }], ["@bob:DEV0"]);
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

  renderTestComponent([{ userId: "@bob", deviceId: "DEV0" }], ["@bob:DEV0"]);

  const audioTrack = tracks[0].publication.track! as RemoteAudioTrack;
  expect(audioTrack.setAudioContext).toHaveBeenCalled();
  expect(audioTrack.setWebAudioPlugins).toHaveBeenCalled();

  expect(testAudioContext.gain.gain.value).toEqual(0.1);
  expect(testAudioContext.pan.pan.value).toEqual(1);
});
