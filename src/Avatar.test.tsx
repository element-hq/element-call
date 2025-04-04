/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { type MatrixClient } from "matrix-js-sdk";
import { type FC, type PropsWithChildren } from "react";

import { ClientContextProvider } from "./ClientContext";
import { Avatar } from "./Avatar";
import { mockMatrixRoomMember, mockRtcMembership } from "./utils/test";

const TestComponent: FC<
  PropsWithChildren<{ client: MatrixClient; supportsThumbnails?: boolean }>
> = ({ client, children, supportsThumbnails }) => {
  return (
    <ClientContextProvider
      value={{
        state: "valid",
        disconnected: false,
        supportedFeatures: {
          reactions: true,
          thumbnails: supportsThumbnails ?? true,
        },
        setClient: vi.fn(),
        authenticated: {
          client,
          isPasswordlessUser: true,
          changePassword: vi.fn(),
          logout: vi.fn(),
        },
      }}
    >
      {children}
    </ClientContextProvider>
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("should just render a placeholder when the user has no avatar", () => {
  const client = vi.mocked<MatrixClient>({
    getAccessToken: () => "my-access-token",
    mxcUrlToHttp: () => vi.fn(),
  } as unknown as MatrixClient);

  vi.spyOn(client, "mxcUrlToHttp");
  const member = mockMatrixRoomMember(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      getMxcAvatarUrl: () => undefined,
    },
  );
  const displayName = "Alice";
  render(
    <TestComponent client={client}>
      <Avatar
        id={member.userId}
        name={displayName}
        size={96}
        src={member.getMxcAvatarUrl()}
      />
    </TestComponent>,
  );
  const element = screen.getByRole("img", { name: "@alice:example.org" });
  expect(element.tagName).toEqual("SPAN");
  expect(client.mxcUrlToHttp).toBeCalledTimes(0);
});

test("should just render a placeholder when thumbnails are not supported", () => {
  const client = vi.mocked<MatrixClient>({
    getAccessToken: () => "my-access-token",
    mxcUrlToHttp: () => vi.fn(),
  } as unknown as MatrixClient);

  vi.spyOn(client, "mxcUrlToHttp");
  const member = mockMatrixRoomMember(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      getMxcAvatarUrl: () => "mxc://example.org/alice-avatar",
    },
  );
  const displayName = "Alice";
  render(
    <TestComponent client={client} supportsThumbnails={false}>
      <Avatar
        id={member.userId}
        name={displayName}
        size={96}
        src={member.getMxcAvatarUrl()}
      />
    </TestComponent>,
  );
  const element = screen.getByRole("img", { name: "@alice:example.org" });
  expect(element.tagName).toEqual("SPAN");
  expect(client.mxcUrlToHttp).toBeCalledTimes(0);
});

test("should attempt to fetch authenticated media", async () => {
  const expectedAuthUrl = "http://example.org/media/alice-avatar";
  const expectedObjectURL = "my-object-url";
  const accessToken = "my-access-token";
  const theBlob = new Blob([]);

  // vitest doesn't have a implementation of create/revokeObjectURL, so we need
  // to delete the property. It's a bit odd, but it works.
  Reflect.deleteProperty(global.window.URL, "createObjectURL");
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue(expectedObjectURL);
  Reflect.deleteProperty(global.window.URL, "revokeObjectURL");
  globalThis.URL.revokeObjectURL = vi.fn();

  const fetchFn = vi.fn().mockResolvedValue({
    blob: async () => Promise.resolve(theBlob),
  });
  vi.stubGlobal("fetch", fetchFn);

  const client = vi.mocked<MatrixClient>({
    getAccessToken: () => accessToken,
    mxcUrlToHttp: () => vi.fn(),
  } as unknown as MatrixClient);

  vi.spyOn(client, "mxcUrlToHttp").mockReturnValue(expectedAuthUrl);
  const member = mockMatrixRoomMember(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      getMxcAvatarUrl: () => "mxc://example.org/alice-avatar",
    },
  );
  const displayName = "Alice";
  render(
    <TestComponent client={client}>
      <Avatar
        id={member.userId}
        name={displayName}
        size={96}
        src={member.getMxcAvatarUrl()}
      />
    </TestComponent>,
  );

  // Fetch is asynchronous, so wait for this to resolve.
  await vi.waitUntil(() =>
    document.querySelector(`img[src='${expectedObjectURL}']`),
  );

  expect(client.mxcUrlToHttp).toBeCalledTimes(1);
  expect(globalThis.fetch).toBeCalledWith(expectedAuthUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
});
