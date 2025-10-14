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
  type Room,
  Track,
} from "livekit-client";
import { type ReactNode } from "react";
import { useTracks } from "@livekit/components-react";

import { testAudioContext } from "../useAudioContext.test";
import * as MediaDevicesContext from "../MediaDevicesContext";
import { LivekitRoomAudioRenderer } from "./MatrixAudioRenderer";
import {
  mockMediaDevices,
  mockRemoteParticipant,
  mockTrack,
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

let tracks: TrackReference[] = [];

/**
 * Render the test component with given rtc members and livekit participant identities.
 *
 * It is possible to have rtc members that are not in livekit (e.g. not yet joined) and vice versa.
 *
 * @param rtcMembers - Array of active rtc members with userId and deviceId.
 * @param livekitParticipantIdentities - Array of livekit participant (that are publishing).
 * @param explicitTracks - Array of tracks available in livekit, if not provided, one audio track per livekitParticipantIdentities will be created.
 * */

function renderTestComponent(
  rtcMembers: { userId: string; deviceId: string }[],
  livekitParticipantIdentities: string[],
  explicitTracks?: {
    participantId: string;
    kind: Track.Kind;
    source: Track.Source;
  }[],
): RenderResult {
  const liveKitParticipants = livekitParticipantIdentities.map((identity) =>
    mockRemoteParticipant({ identity }),
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

  if (explicitTracks?.length ?? 0 > 0) {
    tracks = explicitTracks!.map(({ participantId, source, kind }) => {
      const participant =
        liveKitParticipants.find((p) => p.identity === participantId) ??
        mockRemoteParticipant({ identity: participantId });
      return mockTrack(participant, kind, source);
    });
  } else {
    tracks = participants.map((p) => mockTrack(p));
  }

  vi.mocked(useTracks).mockReturnValue(tracks);
  return render(
    <MediaDevicesProvider value={mockMediaDevices({})}>
      <LivekitRoomAudioRenderer
        validIdentities={participants.map((p) => p.identity)}
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
  name: string;
  rtcUsers: { userId: string; deviceId: string }[];
  livekitParticipantIdentities: string[];
  explicitTracks?: {
    participantId: string;
    kind: Track.Kind;
    source: Track.Source;
  }[];
  expectedAudioTracks: number;
}[] = [
  {
    name: "single user single device",
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
    name: "Charlie is rtc member but not in livekit",
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
    name: "Charlie is in livekit but not rtc member",
    rtcUsers: [
      { userId: "@alice", deviceId: "DEV0" },
      { userId: "@bob", deviceId: "DEV0" },
    ],
    livekitParticipantIdentities: ["@alice:DEV0", "@bob:DEV0", "@charlie:DEV0"],
    expectedAudioTracks: 2,
  },
  {
    name: "no audio track, only video track",
    rtcUsers: [{ userId: "@alice", deviceId: "DEV0" }],
    livekitParticipantIdentities: ["@alice:DEV0"],
    explicitTracks: [
      {
        participantId: "@alice:DEV0",
        kind: Track.Kind.Video,
        source: Track.Source.Camera,
      },
    ],
    expectedAudioTracks: 0,
  },
  {
    name: "Audio track from unknown source",
    rtcUsers: [{ userId: "@alice", deviceId: "DEV0" }],
    livekitParticipantIdentities: ["@alice:DEV0"],
    explicitTracks: [
      {
        participantId: "@alice:DEV0",
        kind: Track.Kind.Audio,
        source: Track.Source.Unknown,
      },
    ],
    expectedAudioTracks: 1,
  },
  {
    name: "Audio track from other device",
    rtcUsers: [{ userId: "@alice", deviceId: "DEV0" }],
    livekitParticipantIdentities: ["@alice:DEV0"],
    explicitTracks: [
      {
        participantId: "@alice:DEV1",
        kind: Track.Kind.Audio,
        source: Track.Source.Microphone,
      },
    ],
    expectedAudioTracks: 0,
  },
  {
    name: "two audio tracks, microphone and screenshare",
    rtcUsers: [{ userId: "@alice", deviceId: "DEV0" }],
    livekitParticipantIdentities: ["@alice:DEV0"],
    explicitTracks: [
      {
        participantId: "@alice:DEV0",
        kind: Track.Kind.Audio,
        source: Track.Source.Microphone,
      },
      {
        participantId: "@alice:DEV0",
        kind: Track.Kind.Audio,
        source: Track.Source.ScreenShareAudio,
      },
    ],
    expectedAudioTracks: 2,
  },
];

it.each(TEST_CASES)(
  `should render sound test cases $name`,
  ({
    rtcUsers,
    livekitParticipantIdentities,
    explicitTracks,
    expectedAudioTracks,
  }) => {
    const { queryAllByTestId } = renderTestComponent(
      rtcUsers,
      livekitParticipantIdentities,
      explicitTracks,
    );
    expect(queryAllByTestId("audio")).toHaveLength(expectedAudioTracks);
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
