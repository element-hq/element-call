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
import EventEmitter from "events";
import { widget } from "./widget";

const TestComponent: FC<
  PropsWithChildren<{
    client: MatrixClient;
    supportsAuthenticatedMedia?: boolean;
  }>
> = ({
  client,
  children,
  supportsAuthenticatedMedia: supportsAuthenticatedMedia,
}) => {
  return (
    <ClientContextProvider
      value={{
        state: "valid",
        disconnected: false,
        supportedFeatures: {
          reactions: true,
          authenticatedMedia: supportsAuthenticatedMedia ?? true,
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

vi.mock("./widget", () => ({
  widget: {
    api: { downloadFile: vi.fn() },
  },
}));

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

test("should attempt to fetch authenticated media if supported", async () => {
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
    <TestComponent client={client} supportsAuthenticatedMedia={true}>
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

test("should attempt to use widget API if authenticate media is not supported", async () => {
  const expectedMXCUrl = "mxc://example.org/alice-avatar";
  const expectedObjectURL = "my-object-url";
  const theBlob = new Blob([]);

  // vitest doesn't have a implementation of create/revokeObjectURL, so we need
  // to delete the property. It's a bit odd, but it works.
  Reflect.deleteProperty(global.window.URL, "createObjectURL");
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue(expectedObjectURL);
  Reflect.deleteProperty(global.window.URL, "revokeObjectURL");
  globalThis.URL.revokeObjectURL = vi.fn();

  const client = vi.mocked<MatrixClient>({
    getAccessToken: () => undefined,
  } as unknown as MatrixClient);

  vi.spyOn(widget!.api, "downloadFile").mockResolvedValue({ file: theBlob });
  const member = mockMatrixRoomMember(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      getMxcAvatarUrl: () => expectedMXCUrl,
    },
  );
  const displayName = "Alice";
  render(
    <TestComponent client={client} supportsAuthenticatedMedia={false}>
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

  expect(widget!.api.downloadFile).toBeCalledWith(expectedMXCUrl);
});
