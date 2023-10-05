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

import { useEnableE2EE } from "../settings/useSetting";
import { useLocalStorage } from "../useLocalStorage";
import { useClient } from "../ClientContext";
import { useUrlParams } from "../UrlParams";
import { widget } from "../widget";

export const getRoomSharedKeyLocalStorageKey = (roomId: string): string =>
  `room-shared-key-${roomId}`;

const useInternalRoomSharedKey = (
  roomId: string
): [string | null, (value: string) => void] => {
  const key = useMemo(() => getRoomSharedKeyLocalStorageKey(roomId), [roomId]);
  const [e2eeEnabled] = useEnableE2EE();
  const [roomSharedKey, setRoomSharedKey] = useLocalStorage(key);

  return [e2eeEnabled ? roomSharedKey : null, setRoomSharedKey];
};

const useKeyFromUrl = (roomId: string): string | null => {
  const urlParams = useUrlParams();
  const [e2eeSharedKey, setE2EESharedKey] = useInternalRoomSharedKey(roomId);

  useEffect(() => {
    if (!urlParams.password) return;
    if (urlParams.password === "") return;
    if (urlParams.password === e2eeSharedKey) return;

    setE2EESharedKey(urlParams.password);
  }, [urlParams, e2eeSharedKey, setE2EESharedKey]);

  return urlParams.password ?? null;
};

export const useRoomSharedKey = (roomId: string): string | null => {
  // make sure we've extracted the key from the URL first
  // (and we still need to take the value it returns because
  // the effect won't run in time for it to save to localstorage in
  // time for us to read it out again).
  const passwordFormUrl = useKeyFromUrl(roomId);

  return useInternalRoomSharedKey(roomId)[0] ?? passwordFormUrl;
};

export const useManageRoomSharedKey = (roomId: string): string | null => {
  const urlPassword = useKeyFromUrl(roomId);

  const [e2eeSharedKey] = useInternalRoomSharedKey(roomId);

  return e2eeSharedKey ?? urlPassword;
};

export const useIsRoomE2EE = (roomId: string): boolean | null => {
  const { client } = useClient();
  const room = useMemo(() => client?.getRoom(roomId) ?? null, [roomId, client]);
  // For now, rooms in widget mode are never considered encrypted.
  // In the future, when widget mode gains encryption support, then perhaps we
  // should inspect the e2eEnabled URL parameter here?
  return useMemo(
    () => widget === null && (room === null || !room.getCanonicalAlias()),
    [room]
  );
};
