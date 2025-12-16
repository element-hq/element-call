/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { TooltipProvider } from "@vector-im/compound-web";
import {
  type TrackReference,
  type TrackReferencePlaceholder,
} from "@livekit/components-core";
import { LocalTrackPublication, Track } from "livekit-client";
import { TrackInfo } from "@livekit/protocol";
import { type ComponentProps } from "react";

import { MediaView } from "./MediaView";
import { EncryptionStatus } from "../state/MediaViewModel";
import { mockLocalParticipant } from "../utils/test";

describe("MediaView", () => {
  const participant = mockLocalParticipant({});
  const trackReferencePlaceholder: TrackReferencePlaceholder = {
    participant,
    source: Track.Source.Camera,
  };
  const trackReference: TrackReference = {
    ...trackReferencePlaceholder,
    publication: new LocalTrackPublication(
      Track.Kind.Video,
      new TrackInfo({ sid: "id", name: "name" }),
    ),
  };

  const baseProps: ComponentProps<typeof MediaView> = {
    displayName: "some name",
    videoEnabled: true,
    videoFit: "contain",
    targetWidth: 300,
    targetHeight: 200,
    encryptionStatus: EncryptionStatus.Connecting,
    mirror: false,
    unencryptedWarning: false,
    video: trackReference,
    userId: "@alice:example.com",
    mxcAvatarUrl: undefined,
    focusable: true,
  };

  test("is accessible", async () => {
    const { container } = render(<MediaView {...baseProps} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  describe("placeholder track", () => {
    test("neither video nor avatar are shown", () => {
      render(<MediaView {...baseProps} video={trackReferencePlaceholder} />);
      expect(screen.queryByTestId("video")).toBeNull();
      expect(
        screen.queryAllByRole("img", { name: "@alice:example.com" }).length,
      ).toBe(0);
    });
  });

  describe("with no video", () => {
    it("shows avatar", () => {
      render(<MediaView {...baseProps} video={undefined} />);
      expect(
        screen.getByRole("img", { name: "@alice:example.com" }),
      ).toBeVisible();
      expect(screen.queryByTestId("video")).toBe(null);
    });
  });

  describe("name tag", () => {
    test("is shown with name", () => {
      render(<MediaView {...baseProps} displayName="Bob" />);
      expect(screen.getByTestId("name_tag")).toHaveTextContent("Bob");
    });
  });

  describe("waitingForMedia", () => {
    test("defaults to false", () => {
      render(<MediaView {...baseProps} />);
      expect(screen.queryAllByText("Waiting for media...").length).toBe(0);
    });
    test("shows and is accessible", async () => {
      const { container } = render(
        <TooltipProvider>
          <MediaView {...baseProps} waitingForMedia={true} />
        </TooltipProvider>,
      );
      expect(await axe(container)).toHaveNoViolations();
      expect(screen.getByText("Waiting for media...")).toBeVisible();
    });
  });

  describe("unencryptedWarning", () => {
    test("is shown and accessible", async () => {
      const { container } = render(
        <TooltipProvider>
          <MediaView {...baseProps} unencryptedWarning={true} />
        </TooltipProvider>,
      );
      expect(await axe(container)).toHaveNoViolations();
      expect(screen.getByRole("img", { name: "Not encrypted" })).toBeTruthy();
    });

    test("is not shown", () => {
      render(
        <TooltipProvider>
          <MediaView {...baseProps} unencryptedWarning={false} />
        </TooltipProvider>,
      );
      expect(
        screen.queryAllByRole("img", { name: "Not encrypted" }).length,
      ).toBe(0);
    });
  });

  describe("videoEnabled", () => {
    test("just video is visible", () => {
      render(
        <TooltipProvider>
          <MediaView {...baseProps} videoEnabled={true} />
        </TooltipProvider>,
      );
      expect(screen.getByTestId("video")).toBeVisible();
      expect(screen.queryAllByRole("img", { name: "some name" }).length).toBe(
        0,
      );
    });

    test("just avatar is visible", () => {
      render(
        <TooltipProvider>
          <MediaView {...baseProps} videoEnabled={false} />
        </TooltipProvider>,
      );
      expect(
        screen.getByRole("img", { name: "@alice:example.com" }),
      ).toBeVisible();
      expect(screen.getByTestId("video")).not.toBeVisible();
    });
  });
});
