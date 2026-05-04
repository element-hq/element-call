/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { type MatrixClient } from "matrix-js-sdk";
import { type FC, type PropsWithChildren } from "react";
import { type WidgetApi } from "matrix-widget-api";

import { ClientContextProvider } from "./ClientContext";
import { Avatar, getAvatarFromWidgetAPI } from "./Avatar";
import { mockMatrixRoomMember, mockRtcMembership } from "./utils/test";
import { widget } from "./widget";

const TestComponent: FC<
  PropsWithChildren<{
    client: MatrixClient;
  }>
> = ({ client, children }) => {
  return (
    <ClientContextProvider
      value={{
        state: "valid",
        disconnected: false,
        supportedFeatures: {
          reactions: true,
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
    api: null, // Ideally we'd only mock this in the as a widget test so the whole module is otherwise null, but just nulling `api` by default works well enough
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

test("should attempt to fetch authenticated media from the server", async () => {
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

test("should attempt to use widget API if running as a widget", async () => {
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

  widget!.api = { downloadFile: vi.fn() } as unknown as WidgetApi;
  vi.spyOn(widget!.api, "downloadFile").mockResolvedValue({ file: theBlob });
  const member = mockMatrixRoomMember(
    mockRtcMembership("@alice:example.org", "AAAA"),
    {
      getMxcAvatarUrl: () => expectedMXCUrl,
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

  expect(widget!.api.downloadFile).toBeCalledWith(expectedMXCUrl);
});

test("Supports download files as base64", async () => {
  const expectedMXCUrl = "mxc://example.org/alice-avatar";
  const expectedBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAADIElEQVR4nAAQA+/8ApxhEfFNuwna" +
    "+DO1pFMx5YDg6gb8p1WFkbFSox9H6r5c8jp1gxlHXrDfA/oQFi4A0gTXH9YBNgwRm12xO68QP6lv" +
    "ZLKH9qW1VM6kz6zA3T1Ui8J+Xbnh2BZ7oXDe/2gajzoA6j1JGotpz99xO+T2NR634Nhx3zhuera/" +
    "UdrpMLdEpwWXLnSqZRasGsrl93FjdTwRBMaqsx6vJksnPOmV9ttbXFIOb0XDGPbVythSC2n7P/bS" +
    "Zv0U0QqbBLk/5Wu1werYzAHiz11Bj8bEylQ92Pxvo+PwF6/KbGnIHTvGZkFzDkMnqz3g7Pw3NOSP" +
    "oV+qfyJuSI0AeZmrPejFQ8kzBSDWO8D7lr4+6ePRBRmZtKCf+fNjSCOyb5jqwhBnD2cycbJtQQbR" +
    "A4qdPG2ONfTPeQgi96+zT7grBI0JwvgFBceJdLJd4BX1VQIyY+j7OYueNWqEpf8iYgMj78I95eRt" +
    "nfPLwlxhVns84iL4Yvw8jDrB9vQi8ktpsdJOMiDwKrBGD3q56COD2oIA96CCBgiro4tkvkumZSAc" +
    "ZKXRLsziUFGytWJLaPjwnzXv2hicPy6k9AXsF3QkysOZAkB3m9XPpixhq9b0OKqV/zZx3L79o6wZ" +
    "Dr40J7sj7f+ARd545CP01r5omHt94tbnjgA46HsM2OhP+qQ882LN+Bhscq2WSHGSHT4J9MQcsWZP" +
    "2+N2LdPy61MN4/1++BJHmDcDLQBUEwLvjZp1fRfzxV7yirwIiOA7Vr8z+1yvS/pSkfUzkjswybOd" +
    "M5i0I8Q69MTXAKxqtR0/tyGkfCmHfupGASp/SAT9J8f3aQV+gDbpva592v4w8Cv5EMm7CzZPwThF" +
    "kgTChNPts7F03ccxpblfIz0EiAON1DKk71rX07BvDlLHY1ItPuqZ7hjy19jrAgl+QqEE1btHVA5R" +
    "uAnRXpEWc6rjARlJY5G1wbMk12rrqpr8rhR3YpFgLgOx4BtQ0D/hGe7KANSGBMQojmObId0asCmd" +
    "XzmnQI9P8QnwsO9vtqZlgIoU4g+f2/G8Q3/nVMX7dujniwEAAP//KmiQs7P8MeIAAAAASUVORK5C" +
    "YII=";
  const mockWidgetAPI = {
    downloadFile: vi.fn().mockImplementation(async (contentUri) => {
      if (contentUri !== expectedMXCUrl) {
        return Promise.reject(new Error("Unexpected content URI"));
      }
      return { file: expectedBase64 };
    }),
  } as unknown as WidgetApi;

  const blob = await getAvatarFromWidgetAPI(mockWidgetAPI, expectedMXCUrl);

  expect(blob).toBeInstanceOf(Blob);
});
