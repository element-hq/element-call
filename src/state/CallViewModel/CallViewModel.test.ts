/*
Copyright 2025 Element Creations Ltd.
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { test, vi, onTestFinished, it, describe, expect } from "vitest";
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  NEVER,
  type Observable,
  of,
  switchMap,
} from "rxjs";
import { SyncState } from "matrix-js-sdk";
import {
  ConnectionState,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
} from "livekit-client";
import * as ComponentsCore from "@livekit/components-core";
import {
  Status,
  type CallMembership,
  type IRTCNotificationContent,
  MatrixRTCSessionEvent,
  type LivekitTransport,
} from "matrix-js-sdk/lib/matrixrtc";
import { deepCompare } from "matrix-js-sdk/lib/utils";

import { type Layout } from "../layout-types.ts";
import {
  mockMatrixRoomMember,
  mockRemoteParticipant,
  withTestScheduler,
  mockRtcMembership,
  testScope,
  exampleTransport,
} from "../../utils/test.ts";
import { E2eeType } from "../../e2ee/e2eeType.ts";
import {
  alice,
  aliceId,
  aliceParticipant,
  aliceRtcMember,
  aliceUserId,
  bob,
  bobId,
  bobRtcMember,
  local,
  localId,
  localRtcMember,
  localRtcMemberDevice2,
} from "../../utils/test-fixtures.ts";
import { MediaDevices } from "../MediaDevices.ts";
import { getValue } from "../../utils/observable.ts";
import { type Behavior, constant } from "../Behavior.ts";
import {
  localParticipant,
  withCallViewModel as withCallViewModelInMode,
} from "./CallViewModelTestUtils.ts";
import { MatrixRTCMode } from "../../config/ConfigOptions.ts";
import { initializeWidget } from "../../widget.ts";

initializeWidget();

vi.mock("rxjs", async (importOriginal) => ({
  ...(await importOriginal()),
  // Disable interval Observables for the following tests since the test
  // scheduler will loop on them forever and never call the test 'done'
  interval: (): Observable<number> => NEVER,
}));

vi.mock("@livekit/components-core");
vi.mock("livekit-client/e2ee-worker?worker");

vi.mock("../e2ee/matrixKeyProvider");

const getUrlParams = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("../UrlParams", () => ({ getUrlParams }));

const getPlatform = vi.hoisted(() => vi.fn(() => "desktop"));
vi.mock("../../Platform", () => ({
  get platform(): string {
    return getPlatform();
  },
  isFirefox: (): boolean => false,
}));

vi.mock(
  "../state/CallViewModel/localMember/localTransport",
  async (importOriginal) => ({
    ...(await importOriginal()),
    makeTransport: async (): Promise<LivekitTransport> =>
      Promise.resolve(exampleTransport),
  }),
);

const yesNo = {
  y: true,
  n: false,
};

const daveRtcMember = mockRtcMembership("@dave:example.org", "DDDD");

// const carol = local;

const dave = mockMatrixRoomMember(daveRtcMember, { rawDisplayName: "Dave" });

const daveId = `${dave.userId}:${daveRtcMember.deviceId}`;

const bobParticipant = mockRemoteParticipant({ identity: bobId });
const daveParticipant = mockRemoteParticipant({ identity: daveId });

export interface GridLayoutSummary {
  type: "grid";
  spotlight?: string[];
  grid: string[];
}

export interface SpotlightLandscapeLayoutSummary {
  type: "spotlight-landscape";
  spotlight: string[];
  grid: string[];
}

export interface SpotlightPortraitLayoutSummary {
  type: "spotlight-portrait";
  spotlight: string[];
  grid: string[];
}

export interface SpotlightExpandedLayoutSummary {
  type: "spotlight-expanded";
  spotlight: string[];
  pip?: string;
}

export interface OneOnOneLandscapeLayoutSummary {
  type: "one-on-one-landscape";
  spotlight: string;
  pip: string;
}

export interface OneOnOnePortraitLayoutSummary {
  type: "one-on-one-portrait";
  spotlight: string[];
  pip?: string;
  pipSize: "sm" | "lg";
}

export interface PipLayoutSummary {
  type: "pip";
  spotlight: string[];
}

export type LayoutSummary =
  | GridLayoutSummary
  | SpotlightLandscapeLayoutSummary
  | SpotlightPortraitLayoutSummary
  | SpotlightExpandedLayoutSummary
  | OneOnOneLandscapeLayoutSummary
  | OneOnOnePortraitLayoutSummary
  | PipLayoutSummary;

function summarizeLayout$(l$: Observable<Layout>): Observable<LayoutSummary> {
  return l$.pipe(
    switchMap((l) => {
      switch (l.type) {
        case "grid":
          return combineLatest(
            [
              l.spotlight?.media$ ?? constant(undefined),
              ...l.grid.map((vm) => vm.media$),
            ],
            (spotlight, ...grid) => ({
              type: l.type,
              spotlight: spotlight?.map((vm) => vm.id),
              grid: grid.map((vm) => vm.id),
            }),
          );
        case "spotlight-landscape":
        case "spotlight-portrait":
          return combineLatest(
            [l.spotlight.media$, ...l.grid.map((vm) => vm.media$)],
            (spotlight, ...grid) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
              grid: grid.map((vm) => vm.id),
            }),
          );
        case "spotlight-expanded":
          return combineLatest(
            [l.spotlight.media$, l.pip?.media$ ?? constant(undefined)],
            (spotlight, pip) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
              pip: pip?.id,
            }),
          );
        case "one-on-one-landscape":
          return combineLatest(
            [l.spotlight.media$, l.pip.media$],
            (spotlight, pip) => ({
              type: l.type,
              spotlight: spotlight.id,
              pip: pip.id,
            }),
          );
        case "one-on-one-portrait":
          return combineLatest(
            [
              l.spotlight.media$,
              l.pip?.media$ ?? constant(undefined),
              l.pipSize$,
            ],
            (spotlight, pip, pipSize) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
              pip: pip?.id,
              pipSize,
            }),
          );
        case "pip":
          return l.spotlight.media$.pipe(
            map((spotlight) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
            })),
          );
      }
    }),
    // Sometimes there can be multiple (synchronous) updates per frame. We only
    // care about the most recent value for each time step, so discard these
    // extra values.
    debounceTime(0),
    distinctUntilChanged(deepCompare),
  );
}

function mockRingEvent(
  eventId: string,
  lifetimeMs: number | undefined,
  sender = local.userId,
): { event_id: string } & IRTCNotificationContent {
  return {
    event_id: eventId,
    ...(lifetimeMs === undefined ? {} : { lifetime: lifetimeMs }),
    notification_type: "ring",
    sender,
  } as unknown as { event_id: string } & IRTCNotificationContent;
}

describe.each([
  [MatrixRTCMode.Legacy],
  [MatrixRTCMode.Compatibility],
  [MatrixRTCMode.Matrix_2_0],
])("CallViewModel (%s mode)", (mode) => {
  const withCallViewModel = withCallViewModelInMode(mode);

  test("participants are retained during a focus switch", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      // Participants disappear on frame 2 and come back on frame 3
      const participantInputMarbles = "a-ba";
      // Start switching focus on frame 1 and reconnect on frame 3
      const connectionInputMarbles = " cs-c";
      // The visible participants should remain the same throughout the switch
      const expectedLayoutMarbles = "  a";

      withCallViewModel(
        {
          remoteParticipants$: behavior(participantInputMarbles, {
            a: [aliceParticipant, bobParticipant],
            b: [],
          }),
          rtcMembers$: constant([localRtcMember, aliceRtcMember, bobRtcMember]),
          livekitConnectionState$: behavior(connectionInputMarbles, {
            c: ConnectionState.Connected,
            s: ConnectionState.Connecting,
          }),
        },
        (vm) => {
          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "grid",
                spotlight: undefined,
                grid: [`${localId}:0`, `${aliceId}:0`, `${bobId}:0`],
              },
            },
          );
        },
      );
    });
  });

  test("remote screen sharing activates spotlight layout", () => {
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      // Start with no screen shares, then have Alice and Bob share their screens,
      // then return to no screen shares, then have just Alice share for a bit
      const aliceSharingInputMarbles = "   ny-n--yn";
      const bobSharingInputMarbles = "     n-y-n---";
      // While there are no screen shares, switch to spotlight manually, and then
      // switch back to grid at the end
      const modeInputMarbles = "           -----s--g";
      // We should automatically enter spotlight for the first round of screen
      // sharing, then return to grid, then manually go into spotlight, and
      // remain in spotlight until we manually go back to grid
      const expectedLayoutMarbles = "      abcdaefeg";
      const expectedShowSpeakingMarbles = "y----nyny";
      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant, bobParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember, bobRtcMember]),
          sharingScreen: new Map([
            [aliceParticipant, behavior(aliceSharingInputMarbles, yesNo)],
            [bobParticipant, behavior(bobSharingInputMarbles, yesNo)],
          ]),
        },
        (vm) => {
          schedule(modeInputMarbles, {
            s: () => vm.setGridMode("spotlight"),
            g: () => vm.setGridMode("grid"),
          });

          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "grid",
                spotlight: undefined,
                grid: [`${localId}:0`, `${aliceId}:0`, `${bobId}:0`],
              },
              b: {
                type: "spotlight-landscape",
                spotlight: [`${aliceId}:0:screen-share`],
                grid: [`${localId}:0`, `${aliceId}:0`, `${bobId}:0`],
              },
              c: {
                type: "spotlight-landscape",
                spotlight: [
                  `${aliceId}:0:screen-share`,
                  `${bobId}:0:screen-share`,
                ],
                grid: [`${localId}:0`, `${aliceId}:0`, `${bobId}:0`],
              },
              d: {
                type: "spotlight-landscape",
                spotlight: [`${bobId}:0:screen-share`],
                grid: [`${localId}:0`, `${aliceId}:0`, `${bobId}:0`],
              },
              e: {
                type: "spotlight-landscape",
                spotlight: [`${aliceId}:0`],
                grid: [`${localId}:0`, `${bobId}:0`],
              },
              f: {
                type: "spotlight-landscape",
                spotlight: [`${aliceId}:0:screen-share`],
                grid: [`${localId}:0`, `${bobId}:0`, `${aliceId}:0`],
              },
              g: {
                type: "grid",
                spotlight: undefined,
                grid: [`${localId}:0`, `${bobId}:0`, `${aliceId}:0`],
              },
            },
          );
          expectObservable(vm.showSpeakingIndicators$).toBe(
            expectedShowSpeakingMarbles,
            yesNo,
          );
        },
      );
    });
  });

  test("local screen sharing stays in grid layout", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      // Local participant shares their screen, then stops sharing
      const sharingInputMarbles = "  nyn";
      // Layout should show the screen share but stay in type: "grid"
      const expectedLayoutMarbles = "aba";
      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant, bobParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember, bobRtcMember]),
          sharingScreen: new Map([
            [localParticipant, behavior(sharingInputMarbles, yesNo)],
          ]),
        },
        (vm) => {
          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "grid",
                spotlight: undefined,
                grid: [`${localId}:0`, `${aliceId}:0`, `${bobId}:0`],
              },
              b: {
                type: "grid",
                spotlight: [`${localId}:0:screen-share`],
                grid: [`${localId}:0`, `${aliceId}:0`, `${bobId}:0`],
              },
            },
          );
        },
      );
    });
  });

  test("local screen sharing in one-on-one call activates grid layout", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      // Local participant shares their screen, then stops sharing
      const sharingInputMarbles = "  nyn";
      // Layout should switch to grid layout then back to one-on-one layout
      const expectedLayoutMarbles = "aba";
      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember]),
          sharingScreen: new Map([
            [localParticipant, behavior(sharingInputMarbles, yesNo)],
          ]),
        },
        (vm) => {
          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "one-on-one-landscape",
                pip: `${localId}:0`,
                spotlight: `${aliceId}:0`,
              },
              b: {
                type: "grid",
                spotlight: [`${localId}:0:screen-share`],
                grid: [`${localId}:0`, `${aliceId}:0`],
              },
            },
          );
        },
      );
    });
  });

  test("one-on-one portrait layout shows local tile when video is enabled", () => {
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      // Local participant enables their video, then disables it
      const videoInputMarbles = "    ny--n";
      // While tile is shown, tap the screen twice
      const tapScreenInputMarbles = "--aa-";
      // Layout should show local tile, make it small, enlarge it again, then hide it
      const expectedLayoutMarbles = "abcba";

      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant]),
          roomMembers: [local, alice],
          rtcMembers$: constant([localRtcMember, aliceRtcMember]),
          videoEnabled: new Map([
            [localParticipant, behavior(videoInputMarbles, yesNo)],
          ]),
          windowSize$: constant({ width: 380, height: 700 }), // Mobile phone in portrait
        },
        (vm) => {
          schedule(tapScreenInputMarbles, { a: () => vm.tapScreen() });

          expectObservable(vm.edgeToEdge$).toBe("y", yesNo); // Edge-to-edge-layout
          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "one-on-one-portrait",
                spotlight: [`${aliceId}:0`],
                pip: undefined,
                pipSize: "lg",
              },
              b: {
                type: "one-on-one-portrait",
                spotlight: [`${aliceId}:0`],
                pip: `${localId}:0`,
                pipSize: "lg",
              },
              c: {
                type: "one-on-one-portrait",
                spotlight: [`${aliceId}:0`],
                pip: `${localId}:0`,
                pipSize: "sm",
              },
            },
          );
        },
      );
    });
  });

  test("one-on-one portrait layout shows name tags in room with 3 members", () => {
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant]),
          // Both Alice and Bob are with us in the room
          roomMembers: [local, alice, bob],
          rtcMembers$: constant([localRtcMember, aliceRtcMember]),
          windowSize$: constant({ width: 380, height: 700 }), // Mobile phone in portrait
        },
        (vm) => {
          // Uses one-on-one portrait layout
          expectObservable(summarizeLayout$(vm.layout$)).toBe("a", {
            a: {
              type: "one-on-one-portrait",
              spotlight: [`${aliceId}:0`],
              pip: undefined,
              pipSize: "lg",
            },
          });
          // It wouldn't be clear whether Alice or Bob is the remote video tile,
          // so the interface must put a name tag on it
          expectObservable(vm.showNameTags$).toBe("y", yesNo);
        },
      );
    });
  });

  test("participants stay in the same order unless to appear/disappear", () => {
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      const visibilityInputMarbles = "a";
      // First Bob speaks, then Dave, then Alice
      const aSpeakingInputMarbles = " n- 1998ms - 1999ms y";
      const bSpeakingInputMarbles = " ny 1998ms n 1999ms -";
      const dSpeakingInputMarbles = " n- 1998ms y 1999ms n";
      // Nothing should change when Bob speaks, because Bob is already on screen.
      // When Dave speaks he should switch with Alice because she's the one who
      // hasn't spoken at all. Then when Alice speaks, she should return to her
      // place at the top.
      const expectedLayoutMarbles = " a  1999ms b 1999ms a 57999ms c 1999ms a";

      withCallViewModel(
        {
          remoteParticipants$: constant([
            aliceParticipant,
            bobParticipant,
            daveParticipant,
          ]),
          rtcMembers$: constant([
            localRtcMember,
            aliceRtcMember,
            bobRtcMember,
            daveRtcMember,
          ]),
          speaking: new Map([
            [aliceParticipant, behavior(aSpeakingInputMarbles, yesNo)],
            [bobParticipant, behavior(bSpeakingInputMarbles, yesNo)],
            [daveParticipant, behavior(dSpeakingInputMarbles, yesNo)],
          ]),
        },
        (vm) => {
          schedule(visibilityInputMarbles, {
            a: () => {
              // We imagine that only three tiles (the first three) will be visible
              // on screen at a time
              vm.layout$.subscribe((layout) => {
                if (layout.type === "grid") layout.setVisibleTiles(3);
              });
            },
          });

          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "grid",
                spotlight: undefined,
                grid: [
                  `${localId}:0`,
                  `${aliceId}:0`,
                  `${bobId}:0`,
                  `${daveId}:0`,
                ],
              },
              b: {
                type: "grid",
                spotlight: undefined,
                grid: [
                  `${localId}:0`,
                  `${daveId}:0`,
                  `${bobId}:0`,
                  `${aliceId}:0`,
                ],
              },
              c: {
                type: "grid",
                spotlight: undefined,
                grid: [
                  `${localId}:0`,
                  `${aliceId}:0`,
                  `${daveId}:0`,
                  `${bobId}:0`,
                ],
              },
            },
          );
        },
      );
    });
  });

  test("participants adjust order when space becomes constrained", () => {
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      // Start with all tiles on screen then shrink to 3
      const visibilityInputMarbles = "a-b";
      // Bob and Dave speak
      const bSpeakingInputMarbles = " ny";
      const dSpeakingInputMarbles = " ny";
      // Nothing should change when Bob or Dave initially speak, because they are
      // on screen. When the screen becomes smaller Alice should move off screen
      // to make way for the speakers (specifically, she should swap with Dave).
      const expectedLayoutMarbles = " a-b";

      withCallViewModel(
        {
          remoteParticipants$: constant([
            aliceParticipant,
            bobParticipant,
            daveParticipant,
          ]),
          rtcMembers$: constant([
            localRtcMember,
            aliceRtcMember,
            bobRtcMember,
            daveRtcMember,
          ]),
          speaking: new Map([
            [bobParticipant, behavior(bSpeakingInputMarbles, yesNo)],
            [daveParticipant, behavior(dSpeakingInputMarbles, yesNo)],
          ]),
        },
        (vm) => {
          let setVisibleTiles: ((value: number) => void) | null = null;
          vm.layout$.subscribe((layout) => {
            if (layout.type === "grid")
              setVisibleTiles = layout.setVisibleTiles;
          });
          schedule(visibilityInputMarbles, {
            a: () => setVisibleTiles!(Infinity),
            b: () => setVisibleTiles!(3),
          });

          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "grid",
                spotlight: undefined,
                grid: [
                  `${localId}:0`,
                  `${aliceId}:0`,
                  `${bobId}:0`,
                  `${daveId}:0`,
                ],
              },
              b: {
                type: "grid",
                spotlight: undefined,
                grid: [
                  `${localId}:0`,
                  `${daveId}:0`,
                  `${bobId}:0`,
                  `${aliceId}:0`,
                ],
              },
            },
          );
        },
      );
    });
  });

  test("layout reacts to window size", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      const windowSizeInputMarbles = "abc";
      const expectedLayoutMarbles = " abc";
      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember]),
          windowSize$: behavior(windowSizeInputMarbles, {
            a: { width: 380, height: 700 }, // Start very narrow, like a phone
            b: { width: 1000, height: 800 }, // Go to normal desktop window size
            c: { width: 200, height: 180 }, // Go to PiP size
          }),
        },
        (vm) => {
          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                // This is the expected one-on-one layout for a narrow window
                type: "one-on-one-portrait",
                spotlight: [`${aliceId}:0`],
                pip: undefined,
                pipSize: "lg",
              },
              b: {
                // In a larger window, expect the normal one-on-one layout
                type: "one-on-one-landscape",
                pip: `${localId}:0`,
                spotlight: `${aliceId}:0`,
              },
              c: {
                // In a PiP-sized window, we of course expect a PiP layout
                type: "pip",
                spotlight: [`${aliceId}:0`],
              },
            },
          );
        },
      );
    });
  });

  test("spotlight speakers swap places", () => {
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      // Go immediately into spotlight mode for the test
      const modeInputMarbles = "     s";
      // First Bob speaks, then Dave, then Alice
      const aSpeakingInputMarbles = "n--y";
      const bSpeakingInputMarbles = "nyn";
      const dSpeakingInputMarbles = "n-yn";
      // Alice should start in the spotlight, then Bob, then Dave, then Alice
      // again. However, the positions of Dave and Bob in the grid should be
      // reversed by the end because they've been swapped in and out of the
      // spotlight.
      const expectedLayoutMarbles = "abcd";

      withCallViewModel(
        {
          remoteParticipants$: constant([
            aliceParticipant,
            bobParticipant,
            daveParticipant,
          ]),
          rtcMembers$: constant([
            localRtcMember,
            aliceRtcMember,
            bobRtcMember,
            daveRtcMember,
          ]),
          speaking: new Map([
            [aliceParticipant, behavior(aSpeakingInputMarbles, yesNo)],
            [bobParticipant, behavior(bSpeakingInputMarbles, yesNo)],
            [daveParticipant, behavior(dSpeakingInputMarbles, yesNo)],
          ]),
        },
        (vm) => {
          schedule(modeInputMarbles, { s: () => vm.setGridMode("spotlight") });

          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "spotlight-landscape",
                spotlight: [`${aliceId}:0`],
                grid: [`${localId}:0`, `${bobId}:0`, `${daveId}:0`],
              },
              b: {
                type: "spotlight-landscape",
                spotlight: [`${bobId}:0`],
                grid: [`${localId}:0`, `${aliceId}:0`, `${daveId}:0`],
              },
              c: {
                type: "spotlight-landscape",
                spotlight: [`${daveId}:0`],
                grid: [`${localId}:0`, `${aliceId}:0`, `${bobId}:0`],
              },
              d: {
                type: "spotlight-landscape",
                spotlight: [`${aliceId}:0`],
                grid: [`${localId}:0`, `${daveId}:0`, `${bobId}:0`],
              },
            },
          );

          // While we expect the media on tiles to change, layout$ itself should
          // *never* meaningfully change. That is, we expect there to be no layout
          // shifts as the spotlight speaker changes; instead, the same tiles
          // should be reused for the whole duration of the test and simply have
          // their media swapped out. This is meaningful for keeping the interface
          // not too visually distracting during back-and-forth conversations,
          // while still animating tiles to express people joining, leaving, etc.
          expectObservable(
            vm.layout$.pipe(
              distinctUntilChanged(deepCompare),
              debounceTime(0),
              map(() => "x"),
            ),
          ).toBe("x"); // Expect just one emission
        },
      );
    });
  });

  test("layout enters picture-in-picture mode when requested", () => {
    withTestScheduler(({ schedule, expectObservable }) => {
      // Enable then disable picture-in-picture
      const pipControlInputMarbles = "-ed";
      // Should go into picture-in-picture layout then back to grid
      const expectedLayoutMarbles = " aba";

      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant, bobParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember, bobRtcMember]),
        },
        (vm) => {
          schedule(pipControlInputMarbles, {
            e: () => window.controls.enablePip(),
            d: () => window.controls.disablePip(),
          });

          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "grid",
                spotlight: undefined,
                grid: [`${localId}:0`, `${aliceId}:0`, `${bobId}:0`],
              },
              b: {
                type: "pip",
                spotlight: [`${aliceId}:0`],
              },
            },
          );
        },
      );
    });
  });

  // Test cases for footer visibility in PIP mode across different platforms
  const PIP_FOOTER_VISIBILITY_TEST_CASES: Array<{
    platform: "ios" | "android" | "desktop";
    expectedMarbles: string;
    description: string;
  }> = [
    {
      platform: "ios",
      expectedMarbles: "tf",
      description: "hidden on iOS",
    },
    {
      platform: "android",
      expectedMarbles: "tf",
      description: "hidden on Android",
    },
    {
      platform: "desktop",
      expectedMarbles: "t",
      description: "visible on desktop",
    },
  ];

  it.each(PIP_FOOTER_VISIBILITY_TEST_CASES)(
    "footer is $description in PIP mode",
    ({ platform: testPlatform, expectedMarbles }) => {
      withTestScheduler(({ schedule, expectObservable }) => {
        // Set platform for this test case
        getPlatform.mockReturnValue(testPlatform);

        // Enable PIP mode after initial render
        const pipControlInputMarbles = "-e";

        withCallViewModel(
          {
            remoteParticipants$: constant([aliceParticipant]),
            rtcMembers$: constant([localRtcMember, aliceRtcMember]),
          },
          (vm) => {
            schedule(pipControlInputMarbles, {
              e: () => window.controls.enablePip(),
            });

            expectObservable(vm.showFooter$).toBe(expectedMarbles, {
              t: true,
              f: false,
            });
          },
        );
      });
    },
  );

  // TODO add media to lk mocks
  test("onPipMediaOrientationUpdate is called with the spotlight media orientation", () => {
    // Set the spy before creating the view model so the initial call is captured
    const onPipMediaOrientationUpdate = vi.fn();
    window.controls.onPipMediaOrientationUpdate = onPipMediaOrientationUpdate;
    onTestFinished(() => {
      window.controls.onPipMediaOrientationUpdate = undefined;
    });

    withTestScheduler(({ behavior }) => {
      // Alice starts as a regular participant, then shares her screen, then stops
      const aliceSharingInputMarbles = "nyn";

      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember]),
          sharingScreen: new Map([
            [aliceParticipant, behavior(aliceSharingInputMarbles, yesNo)],
          ]),
        },
        () => {},
      );
    });

    // Should be called exactly 3 times:
    // 1. Initially with "portrait" (Alice is in spotlight as a user, default portrait orientation)
    // 2. With "landscape" when Alice starts screen sharing (screen shares always use landscape)
    // 3. With "portrait" again when Alice stops screen sharing and returns to user tile
    expect(onPipMediaOrientationUpdate).toHaveBeenCalledTimes(3);
    expect(onPipMediaOrientationUpdate).toHaveBeenNthCalledWith(1, "portrait");
    expect(onPipMediaOrientationUpdate).toHaveBeenNthCalledWith(2, "landscape");
    expect(onPipMediaOrientationUpdate).toHaveBeenNthCalledWith(3, "portrait");
  });

  test("PiP tile in expanded spotlight layout switches speakers without layout shifts", () => {
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      // Switch to spotlight immediately
      const modeInputMarbles = "     s";
      // And expand the spotlight immediately
      const expandInputMarbles = "   a";
      // First Bob speaks, then Dave, then Bob again
      const bSpeakingInputMarbles = "n-yn--yn";
      const dSpeakingInputMarbles = "n---yn";
      // Should show Alice (presenter) in the PiP, then Bob, then Dave, then Bob
      // again
      const expectedLayoutMarbles = "a-b-c-b";

      withCallViewModel(
        {
          remoteParticipants$: constant([
            aliceParticipant,
            bobParticipant,
            daveParticipant,
          ]),
          rtcMembers$: constant([
            localRtcMember,
            aliceRtcMember,
            bobRtcMember,
            daveRtcMember,
          ]),
          speaking: new Map([
            [bobParticipant, behavior(bSpeakingInputMarbles, yesNo)],
            [daveParticipant, behavior(dSpeakingInputMarbles, yesNo)],
          ]),
          sharingScreen: new Map([[aliceParticipant, constant(true)]]),
        },
        (vm) => {
          schedule(modeInputMarbles, {
            s: () => vm.setGridMode("spotlight"),
          });
          schedule(expandInputMarbles, {
            a: () => vm.toggleSpotlightExpanded$.value!(),
          });

          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "spotlight-expanded",
                spotlight: [`${aliceId}:0:screen-share`],
                pip: `${aliceId}:0`,
              },
              b: {
                type: "spotlight-expanded",
                spotlight: [`${aliceId}:0:screen-share`],
                pip: `${bobId}:0`,
              },
              c: {
                type: "spotlight-expanded",
                spotlight: [`${aliceId}:0:screen-share`],
                pip: `${daveId}:0`,
              },
            },
          );

          // While we expect the media on the PiP tile to change, layout$ itself
          // should *never* meaningfully change. That is, we expect the same PiP
          // tile to exist throughout the test and just have its media swapped out
          // when the speaker changes, rather than for tiles to animate in/out.
          // This is meaningful for keeping the interface not too visually
          // distracting during back-and-forth conversations.
          expectObservable(
            vm.layout$.pipe(
              distinctUntilChanged(deepCompare),
              debounceTime(0),
              map(() => "x"),
            ),
          ).toBe("x"); // Expect just one emission
        },
      );
    });
  });

  test("PiP tile in expanded spotlight layout avoids redundantly showing local user", () => {
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      // Switch to spotlight immediately
      const modeInputMarbles = "       s";
      // And expand the spotlight immediately
      const expandInputMarbles = "     a";
      // First no one else is in the call, then Alice joins
      const participantInputMarbles = "ab";
      // First local user should be in the spotlight, then they appear in PiP
      // only once Alice has joined
      const expectedLayoutMarbles = "  ab";

      withCallViewModel(
        {
          rtcMembers$: behavior(participantInputMarbles, {
            a: [localRtcMember],
            b: [localRtcMember, aliceRtcMember],
          }),
          videoEnabled: new Map<Participant, Behavior<boolean>>([
            [localParticipant, constant(true)],
            [aliceParticipant, constant(true)],
          ]),
        },
        (vm) => {
          schedule(modeInputMarbles, {
            s: () => vm.setGridMode("spotlight"),
          });
          schedule(expandInputMarbles, {
            a: () => vm.toggleSpotlightExpanded$.value!(),
          });

          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "spotlight-expanded",
                spotlight: [`${localId}:0`],
                pip: undefined,
              },
              b: {
                type: "spotlight-expanded",
                spotlight: [`${aliceId}:0`],
                pip: `${localId}:0`,
              },
            },
          );
        },
      );
    });
  });

  test("expanded spotlight layout hides PiP tile in one-on-one voice call", () => {
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant]),
          roomMembers: [local, alice],
          rtcMembers$: constant([localRtcMember, aliceRtcMember]),
          videoEnabled: new Map<Participant, Behavior<boolean>>([
            [localParticipant, constant(false)],
            [aliceParticipant, constant(false)],
          ]),
          windowSize$: constant({ width: 700, height: 380 }), // Mobile phone in landscape
        },
        (vm) => {
          // Layout should show remote tile only
          expectObservable(summarizeLayout$(vm.layout$)).toBe("a", {
            a: {
              type: "spotlight-expanded",
              spotlight: [`${aliceId}:0`],
              pip: undefined,
            },
          });
        },
      );
    });
  });

  test("spotlight remembers whether it's expanded", () => {
    withTestScheduler(({ schedule, expectObservable }) => {
      // Start in spotlight mode, then switch to grid and back to spotlight a
      // couple times
      const modeInputMarbles = "     s-gs-gs";
      // Expand and collapse the spotlight
      const expandInputMarbles = "   -a--a";
      // Spotlight should stay expanded during the first mode switch, and stay
      // collapsed during the second mode switch
      const expectedLayoutMarbles = "abcbada";

      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant, bobParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember, bobRtcMember]),
        },
        (vm) => {
          schedule(modeInputMarbles, {
            s: () => vm.setGridMode("spotlight"),
            g: () => vm.setGridMode("grid"),
          });
          schedule(expandInputMarbles, {
            a: () => vm.toggleSpotlightExpanded$.value!(),
          });

          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "spotlight-landscape",
                spotlight: [`${aliceId}:0`],
                grid: [`${localId}:0`, `${bobId}:0`],
              },
              b: {
                type: "spotlight-expanded",
                spotlight: [`${aliceId}:0`],
                pip: undefined,
              },
              c: {
                type: "grid",
                spotlight: undefined,
                grid: [`${localId}:0`, `${aliceId}:0`, `${bobId}:0`],
              },
              d: {
                type: "grid",
                spotlight: undefined,
                grid: [`${localId}:0`, `${bobId}:0`, `${aliceId}:0`],
              },
            },
          );
        },
      );
    });
  });

  test("participants must have a MatrixRTCSession to be visible", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      // iterate through a number of combinations of participants and MatrixRTC memberships
      // Bob never has an MatrixRTC membership
      const participantInputMarbles = "abcd-c";
      // Bob even tries to share his screen at the end
      const bobSharingInputMarbles = " n---yn";
      // Bob should never be visible
      const expectedLayoutMarbles = "  a-bc-b";

      withCallViewModel(
        {
          remoteParticipants$: behavior(participantInputMarbles, {
            a: [],
            b: [bobParticipant],
            c: [aliceParticipant, bobParticipant],
            d: [aliceParticipant, daveParticipant, bobParticipant],
          }),
          rtcMembers$: behavior(participantInputMarbles, {
            a: [localRtcMember],
            b: [localRtcMember],
            c: [localRtcMember, aliceRtcMember],
            d: [localRtcMember, aliceRtcMember, daveRtcMember],
            e: [localRtcMember, aliceRtcMember, daveRtcMember],
          }),
          sharingScreen: new Map([
            [bobParticipant, behavior(bobSharingInputMarbles, yesNo)],
          ]),
        },
        (vm) => {
          vm.setGridMode("grid");
          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "grid",
                spotlight: undefined,
                grid: [`${localId}:0`],
              },
              b: {
                type: "one-on-one-landscape",
                pip: `${localId}:0`,
                spotlight: `${aliceId}:0`,
              },
              c: {
                type: "grid",
                spotlight: undefined,
                grid: [`${localId}:0`, `${aliceId}:0`, `${daveId}:0`],
              },
            },
          );
        },
      );
    });
  });

  it("should show at least one tile per MatrixRTCSession", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      // iterate through some combinations of MatrixRTC memberships
      const scenarioInputMarbles = " abcd";
      // There should always be one tile for each MatrixRTCSession
      const expectedLayoutMarbles = "abcd";

      withCallViewModel(
        {
          rtcMembers$: behavior(scenarioInputMarbles, {
            a: [localRtcMember],
            b: [localRtcMember, aliceRtcMember],
            c: [localRtcMember, aliceRtcMember, daveRtcMember],
            d: [localRtcMember, daveRtcMember],
          }),
        },
        (vm) => {
          vm.setGridMode("grid");
          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "grid",
                spotlight: undefined,
                grid: [`${localId}:0`],
              },
              b: {
                type: "one-on-one-landscape",
                pip: `${localId}:0`,
                spotlight: `${aliceId}:0`,
              },
              c: {
                type: "grid",
                spotlight: undefined,
                grid: [`${localId}:0`, `${aliceId}:0`, `${daveId}:0`],
              },
              d: {
                type: "one-on-one-landscape",
                pip: `${localId}:0`,
                spotlight: `${daveId}:0`,
              },
            },
          );
        },
      );
    });
  });

  it("should rank raised hands above video feeds and below speakers and presenters", () => {
    withTestScheduler(({ schedule, expectObservable }) => {
      // There should always be one tile for each MatrixRTCSession
      const expectedLayoutMarbles = "ab";

      withCallViewModel(
        {
          remoteParticipants$: constant([aliceParticipant, bobParticipant]),
          rtcMembers$: constant([localRtcMember, aliceRtcMember, bobRtcMember]),
        },
        (vm, _rtcSession, { raisedHands$ }) => {
          schedule("ab", {
            a: () => {
              // We imagine that only two tiles (the first two) will be visible on screen at a time
              vm.layout$.subscribe((layout) => {
                if (layout.type === "grid") {
                  layout.setVisibleTiles(2);
                }
              });
            },
            b: () => {
              raisedHands$.next({
                [`${bobRtcMember.userId}:${bobRtcMember.deviceId}`]: {
                  time: new Date(),
                  reactionEventId: "",
                  membershipEventId: "",
                },
              });
            },
          });
          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "grid",
                spotlight: undefined,
                grid: [
                  `${localId}:0`,
                  "@alice:example.org:AAAA:0",
                  "@bob:example.org:BBBB:0",
                ],
              },
              b: {
                type: "grid",
                spotlight: undefined,
                grid: [
                  `${localId}:0`,
                  // Bob shifts up!
                  "@bob:example.org:BBBB:0",
                  "@alice:example.org:AAAA:0",
                ],
              },
            },
          );
        },
      );
    });
  });

  function nooneEverThere$<T>(
    behavior: (marbles: string, values: Record<string, T[]>) => Behavior<T[]>,
  ): Behavior<T[]> {
    return behavior("a-b-c-d", {
      a: [], // Start empty
      b: [], // Alice joins
      c: [], // Alice still there
      d: [], // Alice leaves
    });
  }

  function participantJoinLeave$(
    behavior: (
      marbles: string,
      values: Record<string, RemoteParticipant[]>,
    ) => Behavior<RemoteParticipant[]>,
  ): Behavior<RemoteParticipant[]> {
    return behavior("a-b-c-d", {
      a: [], // Start empty
      b: [aliceParticipant], // Alice joins
      c: [aliceParticipant], // Alice still there
      d: [], // Alice leaves
    });
  }

  function rtcMemberJoinLeave$(
    behavior: (
      marbles: string,
      values: Record<string, CallMembership[]>,
    ) => Behavior<CallMembership[]>,
  ): Behavior<CallMembership[]> {
    return behavior("a-b-c-d", {
      a: [localRtcMember], // Start empty
      b: [localRtcMember, aliceRtcMember], // Alice joins
      c: [localRtcMember, aliceRtcMember], // Alice still there
      d: [localRtcMember], // Alice leaves
    });
  }

  test("autoLeave$ emits only when autoLeaveWhenOthersLeft option is enabled", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: participantJoinLeave$(behavior),
          rtcMembers$: rtcMemberJoinLeave$(behavior),
        },
        (vm) => {
          expectObservable(vm.autoLeave$).toBe("------a", {
            a: "allOthersLeft",
          });
        },
        {
          autoLeaveWhenOthersLeft: true,
          encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
        },
      );
    });
  });

  test("autoLeave$ never emits autoLeaveWhenOthersLeft option is enabled but no-one is there", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: nooneEverThere$(behavior),
          rtcMembers$: nooneEverThere$(behavior),
        },
        (vm) => {
          expectObservable(vm.autoLeave$).toBe("-");
        },
        {
          autoLeaveWhenOthersLeft: true,
          encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
        },
      );
    });
  });

  test("autoLeave$ doesn't emit when autoLeaveWhenOthersLeft option is disabled and all others left", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: participantJoinLeave$(behavior),
          rtcMembers$: rtcMemberJoinLeave$(behavior),
        },
        (vm) => {
          expectObservable(vm.autoLeave$).toBe("-");
        },
        {
          autoLeaveWhenOthersLeft: false,
          encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
        },
      );
    });
  });

  test("autoLeave$ emits when autoLeaveWhenOthersLeft option is enabled and all others left", () => {
    withTestScheduler(({ behavior, expectObservable }) => {
      withCallViewModel(
        {
          remoteParticipants$: behavior("a-b-c-d", {
            a: [], // Alone
            b: [aliceParticipant], // Alice joins
            c: [aliceParticipant],
            d: [], // Local joins with a second device
          }),
          rtcMembers$: behavior("a-b-c-d", {
            a: [localRtcMember], // Start empty
            b: [localRtcMember, aliceRtcMember], // Alice joins
            c: [localRtcMember, aliceRtcMember, localRtcMemberDevice2], // Alice still there
            d: [localRtcMember, localRtcMemberDevice2], // The second Alice leaves
          }),
        },
        (vm) => {
          expectObservable(vm.autoLeave$).toBe("------a", {
            a: "allOthersLeft",
          });
        },
        {
          autoLeaveWhenOthersLeft: true,
          encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
        },
      );
    });
  });

  test("recipient has placeholder tile while ringing or timed out", () => {
    withTestScheduler(({ schedule, expectObservable }) => {
      withCallViewModel(
        {
          roomMembers: [alice, local], // Simulate a DM
        },
        (vm, rtcSession) => {
          // Fire a ringing notification
          schedule("n", {
            n: () => {
              rtcSession.emit(
                MatrixRTCSessionEvent.DidSendCallNotification,
                mockRingEvent("$notif1", 30),
              );
            },
          });

          expectObservable(vm.ringingVm$).toBe("(ab)", {
            a: null,
            b: expect.objectContaining({
              type: "ringing",
              userId: alice.userId,
              intent: "audio",
            }),
          });
          // Layout should show placeholder media for the participant we're
          // ringing the entire time (even once timed out)
          expectObservable(summarizeLayout$(vm.layout$)).toBe("a", {
            a: {
              type: "one-on-one-landscape",
              spotlight: `${localId}:0`,
              pip: `ringing:${aliceUserId}`,
            },
          });
        },
        { waitForCallPickup: true },
      );
    });
  });

  test("recipient's placeholder tile is replaced by their real tile once they answer", () => {
    withTestScheduler(({ behavior, schedule, expectObservable }) => {
      withCallViewModel(
        {
          // Alice answers after 20ms
          rtcMembers$: behavior("a 20ms b", {
            a: [localRtcMember],
            b: [localRtcMember, aliceRtcMember],
          }),
          roomMembers: [alice, local], // Simulate a DM
        },
        (vm, rtcSession) => {
          // Fire a ringing notification
          schedule("n", {
            n: () => {
              rtcSession.emit(
                MatrixRTCSessionEvent.DidSendCallNotification,
                mockRingEvent("$notif1", 30),
              );
            },
          });

          // Should ring until Alice joins
          expectObservable(vm.ringingVm$).toBe("(ab) 17ms a", {
            a: null,
            b: expect.objectContaining({
              type: "ringing",
              userId: alice.userId,
              intent: "audio",
            }),
          });
          // Layout should show placeholder media for the participant we're
          // ringing the entire time
          expectObservable(summarizeLayout$(vm.layout$)).toBe("a 20ms b", {
            a: {
              type: "one-on-one-landscape",
              spotlight: `${localId}:0`,
              pip: `ringing:${aliceUserId}`,
            },
            b: {
              type: "one-on-one-landscape",
              spotlight: `${aliceId}:0`,
              pip: `${localId}:0`,
            },
          });
        },
        { waitForCallPickup: true },
      );
    });
  });

  it.skip("audio output changes when toggling earpiece mode", () => {
    withTestScheduler(({ schedule, expectObservable }) => {
      getUrlParams.mockReturnValue({ controlledAudioDevices: true });
      vi.mocked(ComponentsCore.createMediaDeviceObserver).mockReturnValue(
        of([]),
      );

      const devices = new MediaDevices(testScope());

      window.controls.setAvailableAudioDevices([
        { id: "speaker", name: "Speaker", isSpeaker: true },
        { id: "earpiece", name: "Handset", isEarpiece: true },
        { id: "headphones", name: "Headphones" },
      ]);
      window.controls.setAudioDevice("headphones");

      const toggleInputMarbles = "         -aaa";
      const expectedEarpieceModeMarbles = "n-yn";
      const expectedTargetStateMarbles = " sese";

      withCallViewModel({ mediaDevices: devices }, (vm) => {
        schedule(toggleInputMarbles, {
          a: () => getValue(vm.audioOutputSwitcher$)?.switch(),
        });
        expectObservable(vm.earpieceMode$).toBe(
          expectedEarpieceModeMarbles,
          yesNo,
        );
        expectObservable(
          vm.audioOutputSwitcher$.pipe(
            map((switcher) => switcher?.targetOutput),
          ),
        ).toBe(expectedTargetStateMarbles, { s: "speaker", e: "earpiece" });
      });
    });
  });

  it.skip("media tracks are paused while reconnecting to MatrixRTC", () => {
    withTestScheduler(({ schedule, expectObservable }) => {
      const trackRunning$ = new BehaviorSubject(true);
      const originalPublications = localParticipant.trackPublications;
      localParticipant.trackPublications = new Map([
        [
          "video",
          {
            track: new (class {
              public get isUpstreamPaused(): boolean {
                return !trackRunning$.value;
              }
              public async pauseUpstream(): Promise<void> {
                trackRunning$.next(false);
                return Promise.resolve();
              }
              public async resumeUpstream(): Promise<void> {
                trackRunning$.next(true);
                return Promise.resolve();
              }
            })(),
          } as unknown as LocalTrackPublication,
        ],
      ]);
      onTestFinished(() => {
        localParticipant.trackPublications = originalPublications;
      });

      // There are three indicators that the client might be disconnected from
      // MatrixRTC: whether the sync loop is connected, whether the membership is
      // present in local room state, and whether the membership manager thinks
      // we've hit the timeout for the delayed leave event. Let's test all
      // combinations of these conditions.
      const syncingMarbles = "             nyny----n--y";
      const membershipStatusMarbles = "    y---ny-n-yn-y";
      const probablyLeftMarbles = "        n-----y-ny---n";
      const expectedReconnectingMarbles = "n-ynyny------n";
      const expectedTrackRunningMarbles = "nynynyn------y";

      withCallViewModel(
        { initialSyncState: SyncState.Reconnecting },
        (vm, rtcSession, _subjects, setSyncState) => {
          schedule(syncingMarbles, {
            y: () => setSyncState(SyncState.Syncing),
            n: () => setSyncState(SyncState.Reconnecting),
          });
          schedule(membershipStatusMarbles, {
            y: () => {
              rtcSession.membershipStatus = Status.Connected;
            },
          });
          schedule(probablyLeftMarbles, {
            y: () => {
              rtcSession.probablyLeft = true;
            },
            n: () => {
              rtcSession.probablyLeft = false;
            },
          });
          expectObservable(vm.reconnecting$).toBe(
            expectedReconnectingMarbles,
            yesNo,
          );
          expectObservable(trackRunning$).toBe(
            expectedTrackRunningMarbles,
            yesNo,
          );
        },
      );
    });
  });
});
