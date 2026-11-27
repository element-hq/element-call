/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ConnectionError,
  HTTPError,
  MatrixError,
  UnsupportedDelayedEventsEndpointError,
  UnsupportedStickyEventsEndpointError,
} from "matrix-js-sdk";

/**
 * Wraps a method of the host's client so that what it rejects with is
 * {@link adoptHostError adopted}.
 */
export function adoptingHostErrors<
  F extends (...args: never[]) => Promise<unknown>,
>(call: F): F {
  const adopting = async (
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> => {
    try {
      return (await call(...args)) as Awaited<ReturnType<F>>;
    } catch (e) {
      throw adoptHostError(e);
    }
  };
  return adopting as F;
}

/**
 * The same error as one of our own js-sdk's classes, where it is one of the
 * host's.
 *
 * The host's client is a different copy of the js-sdk, and ours (the MatrixRTC
 * session above all) tells rate limits, network failures and missing endpoints
 * apart with `instanceof`, which never matches the host's classes.
 */
export function adoptHostError(error: unknown): unknown {
  if (!(error instanceof Error) || isOwn(error)) return error;
  const adopted = adopt(error);
  if (adopted === undefined) return error;
  adopted.stack = error.stack;
  return adopted;
}

function isOwn(error: Error): boolean {
  return (
    error instanceof HTTPError ||
    error instanceof ConnectionError ||
    error instanceof UnsupportedStickyEventsEndpointError ||
    error instanceof UnsupportedDelayedEventsEndpointError
  );
}

/** Recognised by shape, since the host's classes cannot be named. */
function adopt(error: Error & Partial<HostErrorFields>): Error | undefined {
  switch (error.name) {
    case "ConnectionError":
      return new ConnectionError(error.message);
    case "UnsupportedStickyEventsEndpointError":
      return new UnsupportedStickyEventsEndpointError(
        error.message,
        error.clientEndpoint as UnsupportedStickyEventsEndpointError["clientEndpoint"],
        { cause: error.cause },
      );
    case "UnsupportedDelayedEventsEndpointError":
      return new UnsupportedDelayedEventsEndpointError(
        error.message,
        error.clientEndpoint as UnsupportedDelayedEventsEndpointError["clientEndpoint"],
      );
  }
  if (typeof error.isRateLimitError !== "function") return undefined;
  if (error.data !== undefined)
    return new MatrixError(
      error.data,
      error.httpStatus,
      error.url,
      error.event,
      error.httpHeaders,
    );
  return new HTTPError(error.message, error.httpStatus, error.httpHeaders);
}

type HostErrorFields = Pick<
  MatrixError,
  "data" | "httpStatus" | "httpHeaders" | "url" | "event" | "isRateLimitError"
> & { clientEndpoint: string };
