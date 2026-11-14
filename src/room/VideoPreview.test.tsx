/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, describe, it, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { constant } from "@element-hq/matrixrtc-sdk";

import { type MatrixInfo, VideoPreview } from "./VideoPreview";
import { E2eeType } from "../e2ee/e2eeType";
import { mockVideoTrack } from "../utils/test";
import styles from "./VideoPreview.module.css";

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
        videoEnabled={false}
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
        videoEnabled
        videoTrack={null}
        children={<></>}
      />,
    );
    expect(queryByRole("status")).toHaveTextContent("Video loading...");
  });

  it("mirrors a camera that doesn't say which way it faces", () => {
    const { container } = render(
      <VideoPreview
        matrixInfo={matrixInfo}
        videoEnabled
        videoTrack={mockVideoTrack({ facingMode$: constant(undefined) })}
        children={<></>}
      />,
    );
    expect(
      container.querySelector("video")!.classList.contains(styles.mirror),
    ).toBe(true);
  });
});
