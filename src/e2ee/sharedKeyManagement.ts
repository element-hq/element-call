/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { useEffect, useMemo } from "react";

import { setLocalStorageItem, useLocalStorage } from "../useLocalStorage";
import { UrlParams, getUrlParams, useUrlParams } from "../UrlParams";
import { E2eeType } from "./e2eeType";
import { useClient } from "../ClientContext";

export function saveKeyForRoom(roomId: string, password: string): void {
  setLocalStorageItem(getRoomSharedKeyLocalStorageKey(roomId), password);
}

const getRoomSharedKeyLocalStorageKey = (roomId: string): string =>
  `room-shared-key-${roomId}`;

const useInternalRoomSharedKey = (roomId: string): string | null => {
  const key = getRoomSharedKeyLocalStorageKey(roomId);
  const roomSharedKey = useLocalStorage(key)[0];

  return roomSharedKey;
};

export function getKeyForRoom(roomId: string): string | null {
  saveKeyFromUrlParams(getUrlParams());
  const key = getRoomSharedKeyLocalStorageKey(roomId);
  return localStorage.getItem(key);
}

function saveKeyFromUrlParams(urlParams: UrlParams): void {
  if (!urlParams.password || !urlParams.roomId) return;

  // Take the key from the URL and save it.
  // It's important to always use the room ID specified in the URL
  // when saving keys rather than whatever the current room ID might be,
  // in case we've moved to a different room but the URL hasn't changed.
  saveKeyForRoom(urlParams.roomId, urlParams.password);
}

/**
 * Extracts the room password from the URL if one is present, saving it in localstorage
 * and returning it in a tuple with the corresponding room ID from the URL.
 * @returns A tuple of the roomId and password from the URL if the URL has both,
 *          otherwise [undefined, undefined]
 */
const useKeyFromUrl = (): [string, string] | [undefined, undefined] => {
  const urlParams = useUrlParams();

  useEffect(() => saveKeyFromUrlParams(urlParams), [urlParams]);

  return urlParams.roomId && urlParams.password
    ? [urlParams.roomId, urlParams.password]
    : [undefined, undefined];
};

export type Unencrypted = { kind: E2eeType.NONE };
export type SharedSecret = { kind: E2eeType.SHARED_KEY; secret: string };
export type PerParticipantE2EE = { kind: E2eeType.PER_PARTICIPANT };
export type EncryptionSystem = Unencrypted | SharedSecret | PerParticipantE2EE;

export function useRoomEncryptionSystem(roomId: string): EncryptionSystem {
  const { client } = useClient();

  // make sure we've extracted the key from the URL first
  // (and we still need to take the value it returns because
  // the effect won't run in time for it to save to localstorage in
  // time for us to read it out again).
  const [urlRoomId, passwordFromUrl] = useKeyFromUrl();
  const storedPassword = useInternalRoomSharedKey(roomId);
  const room = client?.getRoom(roomId);
  const e2eeSystem = <EncryptionSystem>useMemo(() => {
    if (!room) return { kind: E2eeType.NONE };
    if (storedPassword)
      return {
        kind: E2eeType.SHARED_KEY,
        secret: storedPassword,
      };
    if (urlRoomId === roomId)
      return {
        kind: E2eeType.SHARED_KEY,
        secret: passwordFromUrl,
      };
    if (room.hasEncryptionStateEvent()) {
      return { kind: E2eeType.PER_PARTICIPANT };
    }
    return { kind: E2eeType.NONE };
  }, [passwordFromUrl, room, roomId, storedPassword, urlRoomId]);
  return e2eeSystem;
}
