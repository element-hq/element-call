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
import { isE2EESupported } from "livekit-client";

import { useEnableSPAE2EE } from "../settings/useSetting";
import { useLocalStorage } from "../useLocalStorage";
import { useClient } from "../ClientContext";
import { PASSWORD_STRING, useUrlParams } from "../UrlParams";

export const getRoomSharedKeyLocalStorageKey = (roomId: string): string =>
  `room-shared-key-${roomId}`;

export const useInternalRoomSharedKey = (
  roomId: string
): [string | null, (value: string) => void] => {
  const key = useMemo(() => getRoomSharedKeyLocalStorageKey(roomId), [roomId]);
  const [e2eeEnabled] = useEnableSPAE2EE();
  const [roomSharedKey, setRoomSharedKey] = useLocalStorage(key);

  return [e2eeEnabled ? roomSharedKey : null, setRoomSharedKey];
};

export const useRoomSharedKey = (roomId: string): string | null => {
  return useInternalRoomSharedKey(roomId)[0];
};

export const useManageRoomSharedKey = (roomId: string): string | null => {
  const { password } = useUrlParams();
  const [e2eeSharedKey, setE2EESharedKey] = useInternalRoomSharedKey(roomId);

  useEffect(() => {
    if (!password) return;
    if (password === "") return;
    if (password === e2eeSharedKey) return;

    setE2EESharedKey(password);
  }, [password, e2eeSharedKey, setE2EESharedKey]);

  useEffect(() => {
    const hash = location.hash;

    if (!hash.includes("?")) return;
    if (!hash.includes(PASSWORD_STRING)) return;
    if (password !== e2eeSharedKey) return;

    const [hashStart, passwordStart] = hash.split(PASSWORD_STRING);
    const hashEnd = passwordStart.split("&")[1];

    location.replace((hashStart ?? "") + (hashEnd ?? ""));
  }, [password, e2eeSharedKey]);

  return e2eeSharedKey;
};

export const useIsRoomE2EE = (roomId: string): boolean | null => {
  const { isEmbedded, perParticipantE2EE } = useUrlParams();
  const client = useClient();
  const room = useMemo(
    () => client.client?.getRoom(roomId) ?? null,
    [roomId, client.client]
  );
  const isE2EE = useMemo(() => {
    if (isEmbedded) {
      return perParticipantE2EE;
    } else {
      return room ? !room?.getCanonicalAlias() : null;
    }
  }, [room, isEmbedded, perParticipantE2EE]);

  return isE2EE;
};

export const useEnableEmbeddedE2EE = (): boolean => {
  const { isEmbedded, perParticipantE2EE } = useUrlParams();

  if (!isEmbedded) return false;
  if (!isE2EESupported()) return false;

  return perParticipantE2EE;
};

export const useEnableE2EE = (): boolean => {
  const [spaE2EEEnabled] = useEnableSPAE2EE();
  const embeddedE2EEEnabled = useEnableEmbeddedE2EE();

  const e2eeEnabled = useMemo(
    () => spaE2EEEnabled || embeddedE2EEEnabled,
    [spaE2EEEnabled, embeddedE2EEEnabled]
  );

  return e2eeEnabled;
};
