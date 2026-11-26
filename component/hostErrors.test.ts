/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "vitest";
import {
  ConnectionError,
  HTTPError,
  MatrixError,
  UnsupportedDelayedEventsEndpointError,
  UnsupportedStickyEventsEndpointError,
} from "matrix-js-sdk";

import { adoptHostError, adoptingHostErrors } from "./hostErrors";

test("a rate limit from the host is one of ours, retry delay included", () => {
  const error = adoptHostError(
    new HostMatrixError(
      { errcode: "M_LIMIT_EXCEEDED", error: "Too many requests" },
      429,
      "https://matrix.example.org/_matrix/client/v3/rooms/x/send",
      new Headers({ "Retry-After": "3" }),
    ),
  );

  expect(error).toBeInstanceOf(MatrixError);
  const matrixError = error as MatrixError;
  expect(matrixError.errcode).toBe("M_LIMIT_EXCEEDED");
  expect(matrixError.data).toEqual({
    errcode: "M_LIMIT_EXCEEDED",
    error: "Too many requests",
  });
  expect(matrixError.httpStatus).toBe(429);
  expect(matrixError.url).toBe(
    "https://matrix.example.org/_matrix/client/v3/rooms/x/send",
  );
  expect(matrixError.isRateLimitError()).toBe(true);
  expect(matrixError.getRetryAfterMs()).toBe(3000);
});

test("an HTTP error without a Matrix body from the host is one of ours", () => {
  const error = adoptHostError(new HostHTTPError("Conflict", 409));

  expect(error).toBeInstanceOf(HTTPError);
  expect(error).not.toBeInstanceOf(MatrixError);
  expect((error as HTTPError).httpStatus).toBe(409);
  expect((error as HTTPError).message).toBe("Conflict");
});

test("a connection failure from the host is one of ours", () => {
  const error = adoptHostError(new HostConnectionError("fetch failed"));

  expect(error).toBeInstanceOf(ConnectionError);
  expect((error as ConnectionError).message).toBe("fetch failed");
});

test("missing sticky and delayed event endpoints on the host's server are ours", () => {
  const sticky = adoptHostError(
    new HostUnsupportedEndpointError(
      "UnsupportedStickyEventsEndpointError",
      "sendStickyEvent",
    ),
  );
  const delayed = adoptHostError(
    new HostUnsupportedEndpointError(
      "UnsupportedDelayedEventsEndpointError",
      "sendDelayedStateEvent",
    ),
  );

  expect(sticky).toBeInstanceOf(UnsupportedStickyEventsEndpointError);
  expect((sticky as UnsupportedStickyEventsEndpointError).clientEndpoint).toBe(
    "sendStickyEvent",
  );
  expect(delayed).toBeInstanceOf(UnsupportedDelayedEventsEndpointError);
  expect(
    (delayed as UnsupportedDelayedEventsEndpointError).clientEndpoint,
  ).toBe("sendDelayedStateEvent");
});

test("keeps where the host's error was thrown", () => {
  const original = new HostConnectionError("fetch failed");

  expect((adoptHostError(original) as Error).stack).toBe(original.stack);
});

test("leaves our own errors and everything else as they are", () => {
  const own = new MatrixError({ errcode: "M_FORBIDDEN" }, 403);
  const refusedByWidgetHost = new Error("Action not allowed");
  const aborted = new DOMException("Aborted", "AbortError");

  expect(adoptHostError(own)).toBe(own);
  expect(adoptHostError(refusedByWidgetHost)).toBe(refusedByWidgetHost);
  expect(adoptHostError(aborted)).toBe(aborted);
  expect(adoptHostError("not an error")).toBe("not an error");
});

test("a wrapped host method rejects with ours and resolves as it did", async () => {
  const failing = adoptingHostErrors(async (): Promise<string> =>
    Promise.reject(new HostConnectionError("fetch failed")),
  );
  const succeeding = adoptingHostErrors(
    async (a: number, b: number): Promise<number> => Promise.resolve(a + b),
  );

  await expect(failing()).rejects.toBeInstanceOf(ConnectionError);
  await expect(succeeding(1, 2)).resolves.toBe(3);
});

// Lookalikes of the host js-sdk's classes: the same shape, but not ours

class HostHTTPError extends Error {
  public constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly httpHeaders?: Headers,
  ) {
    super(message);
  }

  public isRateLimitError(): boolean {
    return this.httpStatus === 429;
  }
}

class HostMatrixError extends HostHTTPError {
  public readonly errcode?: string;

  public constructor(
    public data: { errcode?: string; error?: string },
    httpStatus?: number,
    public url?: string,
    httpHeaders?: Headers,
  ) {
    super(`MatrixError: ${data.error}`, httpStatus, httpHeaders);
    this.errcode = data.errcode;
    this.name = data.errcode ?? "Unknown error code";
  }
}

class HostConnectionError extends Error {
  public get name(): string {
    return "ConnectionError";
  }
}

class HostUnsupportedEndpointError extends Error {
  public constructor(
    name: string,
    public clientEndpoint: string,
  ) {
    super(`Server does not support ${clientEndpoint}`);
    this.name = name;
  }
}
