/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { vi, test, onTestFinished } from "vitest";
import { createMediaDeviceObserver } from "@livekit/components-core";
import { map, of } from "rxjs";

import { withTestScheduler } from "../utils/test";
import { MediaDevices } from "./MediaDevices";
import { ObservableScope } from "./ObservableScope";

const getUrlParams = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("../UrlParams", () => ({ getUrlParams }));

vi.mock("@livekit/components-core");

test("audio output changes when toggling earpiece mode", () => {
  withTestScheduler(({ schedule, expectObservable }) => {
    getUrlParams.mockReturnValue({ controlledAudioDevices: true });
    vi.mocked(createMediaDeviceObserver).mockReturnValue(of([]));

    const scope = new ObservableScope();
    onTestFinished(() => scope.end());
    const devices = new MediaDevices(scope);

    window.controls.setAvailableAudioDevices([
      { id: "speaker", name: "Speaker", isSpeaker: true },
      { id: "earpiece", name: "Earpiece", isEarpiece: true },
    ]);

    const toggleInputMarbles = "           -aa";
    const expectedEarpieceModeMarbles = "  nyn";
    const expectedSelectedOutputMarbles = "ses";

    schedule(toggleInputMarbles, {
      a: () => window.controls.toggleEarpieceMode(),
    });
    expectObservable(devices.earpieceMode$).toBe(expectedEarpieceModeMarbles, {
      n: false,
      y: true,
    });
    expectObservable(
      devices.audioOutput.selected$.pipe(map((d) => d?.id)),
    ).toBe(expectedSelectedOutputMarbles, { s: "speaker", e: "earpiece" });
  });
});
