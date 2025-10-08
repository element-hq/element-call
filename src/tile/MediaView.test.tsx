/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, test, vi } from "vitest";
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
import { type RoomMember } from "matrix-js-sdk";

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
    member: vi.mocked<RoomMember>({
      userId: "@alice:example.com",
      getMxcAvatarUrl: vi.fn().mockReturnValue(undefined),
    } as unknown as RoomMember),
    localParticipant: false,
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

  describe("with no participant", () => {
    it("shows avatar for local user", () => {
      render(
        <MediaView {...baseProps} video={undefined} localParticipant={true} />,
      );
      expect(
        screen.getByRole("img", { name: "@alice:example.com" }),
      ).toBeVisible();
      expect(screen.queryAllByText("Waiting for media...").length).toBe(0);
    });
    it("shows avatar and label for remote user", () => {
      render(
        <MediaView {...baseProps} video={undefined} localParticipant={false} />,
      );
      expect(
        screen.getByRole("img", { name: "@alice:example.com" }),
      ).toBeVisible();
      expect(screen.getByText("Waiting for media...")).toBeVisible();
    });
  });

  describe("name tag", () => {
    test("is shown with name", () => {
      render(<MediaView {...baseProps} displayName="Bob" />);
      expect(screen.getByTestId("name_tag")).toHaveTextContent("Bob");
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
