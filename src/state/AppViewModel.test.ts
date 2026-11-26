/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventEmitter } from "events";
import { expect, test, vi } from "vitest";
import { BehaviorSubject } from "rxjs";
import { ClientEvent, type MatrixClient } from "matrix-js-sdk";
import { SyncState } from "matrix-js-sdk/lib/sync";

import { AppViewModel } from "./AppViewModel";
import { type ClientSessionState } from "./ClientSession";
import { testScope } from "../utils/test";

// The devices are beside the point here, and jsdom has none to enumerate
vi.mock("./MediaDevices", () => ({ MediaDevices: class {} }));

const connectionError = Object.assign(new Error("offline"), {
  name: "ConnectionError",
});

const mockClient = (): MatrixClient =>
  new EventEmitter() as unknown as MatrixClient;
const failSync = (client: MatrixClient, error = connectionError): boolean =>
  client.emit(ClientEvent.Sync, SyncState.Error, null, { error });
const sync = (client: MatrixClient): boolean =>
  client.emit(ClientEvent.Sync, SyncState.Syncing, null);

const signedIn = (client: MatrixClient): ClientSessionState => ({
  state: "signedIn",
  client,
  passwordlessUser: false,
});

function build(state$: BehaviorSubject<ClientSessionState>): AppViewModel {
  return new AppViewModel(
    testScope(),
    { controlledAudioDevices: false },
    { state$ },
    null,
  );
}

test("is disconnected while the client's sync fails to connect", () => {
  const client = mockClient();
  const vm = build(new BehaviorSubject(signedIn(client)));
  const seen: boolean[] = [];
  vm.disconnected$.subscribe((d) => seen.push(d));

  failSync(client);
  // Any other failure is not a connection problem
  failSync(client, new Error("rate limited"));
  failSync(client);
  sync(client);

  expect(seen).toEqual([false, true, false, true, false]);
});

test("starts connected again when the client changes", () => {
  const first = mockClient();
  const state$ = new BehaviorSubject(signedIn(first));
  const vm = build(state$);
  failSync(first);
  expect(vm.disconnected$.value).toBe(true);

  state$.next(signedIn(mockClient()));
  expect(vm.disconnected$.value).toBe(false);
  // The old client is no longer listened to
  failSync(first);
  expect(vm.disconnected$.value).toBe(false);
});

test("is not disconnected when no one is signed in", () => {
  const client = mockClient();
  const state$ = new BehaviorSubject(signedIn(client));
  const vm = build(state$);
  failSync(client);

  state$.next({ state: "signedOut" });
  expect(vm.disconnected$.value).toBe(false);
});
