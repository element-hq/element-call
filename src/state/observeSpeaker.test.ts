/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, test } from "vitest";

import { withTestScheduler } from "../utils/test";
import { observeSpeaker$ } from "./observeSpeaker";

const yesNo = {
  y: true,
  n: false,
};

describe("observeSpeaker", () => {
  describe("does not activate", () => {
    const expectedOutputMarbles = "n";
    test("starts correctly", () => {
      // should default to false when no input is given
      const speakingInputMarbles = "";
      withTestScheduler(({ hot, expectObservable }) => {
        expectObservable(
          observeSpeaker$(hot(speakingInputMarbles, yesNo)),
        ).toBe(expectedOutputMarbles, yesNo);
      });
    });

    test("after no speaking", () => {
      const speakingInputMarbles = "n";
      withTestScheduler(({ hot, expectObservable }) => {
        expectObservable(
          observeSpeaker$(hot(speakingInputMarbles, yesNo)),
        ).toBe(expectedOutputMarbles, yesNo);
      });
    });

    test("with speaking for 1ms", () => {
      const speakingInputMarbles = "y n";
      withTestScheduler(({ hot, expectObservable }) => {
        expectObservable(
          observeSpeaker$(hot(speakingInputMarbles, yesNo)),
        ).toBe(expectedOutputMarbles, yesNo);
      });
    });

    test("with speaking for 999ms", () => {
      const speakingInputMarbles = "y 999ms n";
      withTestScheduler(({ hot, expectObservable }) => {
        expectObservable(
          observeSpeaker$(hot(speakingInputMarbles, yesNo)),
        ).toBe(expectedOutputMarbles, yesNo);
      });
    });

    test("with speaking intermittently", () => {
      const speakingInputMarbles =
        "y 199ms n 199ms y 199ms n 199ms y 199ms n 199ms y 199ms n 199ms y 199ms n 199ms y 199ms n 199ms y 199ms n 199ms y 199ms n";
      withTestScheduler(({ hot, expectObservable }) => {
        expectObservable(
          observeSpeaker$(hot(speakingInputMarbles, yesNo)),
        ).toBe(expectedOutputMarbles, yesNo);
      });
    });

    test("with consecutive speaking then stops speaking", () => {
      const speakingInputMarbles = "y y y y y y y y y y n";
      withTestScheduler(({ hot, expectObservable }) => {
        expectObservable(
          observeSpeaker$(hot(speakingInputMarbles, yesNo)),
        ).toBe(expectedOutputMarbles, yesNo);
      });
    });
  });

  describe("activates", () => {
    test("after 1s", () => {
      // this will active after 1s as no `n` follows it:
      const speakingInputMarbles = " y";
      const expectedOutputMarbles = "n 999ms y";
      withTestScheduler(({ hot, expectObservable }) => {
        expectObservable(
          observeSpeaker$(hot(speakingInputMarbles, yesNo)),
        ).toBe(expectedOutputMarbles, yesNo);
      });
    });

    test("speaking for 1001ms activates for 60s", () => {
      const speakingInputMarbles = " y 1s    n      ";
      const expectedOutputMarbles = "n 999ms y 60s n";
      withTestScheduler(({ hot, expectObservable }) => {
        expectObservable(
          observeSpeaker$(hot(speakingInputMarbles, yesNo)),
        ).toBe(expectedOutputMarbles, yesNo);
      });
    });

    test("speaking for 5s activates for 64s", () => {
      const speakingInputMarbles = " y 5s    n      ";
      const expectedOutputMarbles = "n 999ms y 64s n";
      withTestScheduler(({ hot, expectObservable }) => {
        expectObservable(
          observeSpeaker$(hot(speakingInputMarbles, yesNo)),
        ).toBe(expectedOutputMarbles, yesNo);
      });
    });
  });
});
