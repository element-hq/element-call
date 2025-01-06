/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { expect, describe, it, vi, beforeAll } from "vitest";
import { render } from "@testing-library/react";

import { type MatrixInfo, VideoPreview } from "./VideoPreview";
import { type MuteStates } from "./MuteStates";
import { E2eeType } from "../e2ee/e2eeType";

function mockMuteStates({ audio = true, video = true } = {}): MuteStates {
  return {
    audio: { enabled: audio, setEnabled: vi.fn() },
    video: { enabled: video, setEnabled: vi.fn() },
  };
}

describe("VideoPreview", () => {
  const matrixInfo: MatrixInfo = {
    userId: "@a:example.org",
    displayName: "Alice",
    avatarUrl: "",
    roomId: "",
    roomName: "",
    e2eeSystem: { kind: E2eeType.NONE },
    roomAlias: null,
    roomAvatar: null,
  };

  beforeAll(() => {
    window.ResizeObserver = class ResizeObserver {
      public observe(): void {
        // do nothing
      }
      public unobserve(): void {
        // do nothing
      }
      public disconnect(): void {
        // do nothing
      }
    };
  });

  it("shows avatar with video disabled", () => {
    const { queryByRole } = render(
      <VideoPreview
        matrixInfo={matrixInfo}
        muteStates={mockMuteStates({ video: false })}
        videoTrack={null}
        children={<></>}
      />,
    );
    expect(queryByRole("img", { name: "@a:example.org" })).toBeVisible();
  });

  it("shows loading status with video enabled but no track", () => {
    const { queryByRole } = render(
      <VideoPreview
        matrixInfo={matrixInfo}
        muteStates={mockMuteStates({ video: true })}
        videoTrack={null}
        children={<></>}
      />,
    );
    expect(queryByRole("status")).toHaveTextContent(
      "video_tile.camera_starting",
    );
  });
});
