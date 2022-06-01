/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import { useCallback, useEffect, useState } from "react";
import { MatrixClient, ClientEvent } from "matrix-js-sdk/src/client";
import { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { CallFeed, CallFeedEvent } from "matrix-js-sdk/src/webrtc/callFeed";
import { logger } from "matrix-js-sdk/src/logger";
import { SyncState } from "matrix-js-sdk/src/sync";

import { PlayClipFunction, PTTClipID } from "../sound/usePttSounds";

// Works out who the active speaker should be given what feeds are active and
// the power level of each user.
function getActiveSpeakerFeed(
  feeds: CallFeed[],
  groupCall: GroupCall
): CallFeed | null {
  const activeSpeakerFeeds = feeds.filter((f) => !f.isAudioMuted());

  let activeSpeakerFeed = null;
  let highestPowerLevel = null;
  for (const feed of activeSpeakerFeeds) {
    const member = groupCall.room.getMember(feed.userId);
    if (highestPowerLevel === null || member.powerLevel > highestPowerLevel) {
      highestPowerLevel = member.powerLevel;
      activeSpeakerFeed = feed;
    }
  }

  return activeSpeakerFeed;
}

export interface PTTState {
  pttButtonHeld: boolean;
  isAdmin: boolean;
  talkOverEnabled: boolean;
  setTalkOverEnabled: (boolean) => void;
  activeSpeakerUserId: string;
  startTalking: () => void;
  stopTalking: () => void;
  transmitBlocked: boolean;
  // connected is actually an indication of whether we're connected to the HS
  // (ie. the client's syncing state) rather than media connection, since
  // it's peer to peer so we can't really say once peer is 'disconnected' if
  // there's only one other person in the call and they've lost Internet.
  connected: boolean;
}

let btsetupdone = false;
let characteristics;
let globalButtonHeld;

export const usePTT = (
  client: MatrixClient,
  groupCall: GroupCall,
  userMediaFeeds: CallFeed[],
  playClip: PlayClipFunction,
  enablePTTButton: boolean
): PTTState => {
  // Used to serialise all the mute calls so they don't race. It has
  // its own state as its always set separately from anything else.
  const [mutePromise, setMutePromise] = useState(
    Promise.resolve<boolean | void>(false)
  );

  // Wrapper to serialise all the mute operations on the promise
  const setMicMuteWrapper = useCallback(
    (muted: boolean) => {
      setMutePromise(
        mutePromise.then(() => {
          return groupCall.setMicrophoneMuted(muted).catch((e) => {
            logger.error("Failed to unmute microphone", e);
          });
        })
      );
    },
    [groupCall, mutePromise]
  );

  const [
    {
      pttButtonHeld,
      isAdmin,
      talkOverEnabled,
      activeSpeakerUserId,
      transmitBlocked,
    },
    setState,
  ] = useState(() => {
    const roomMember = groupCall.room.getMember(client.getUserId());

    const activeSpeakerFeed = getActiveSpeakerFeed(userMediaFeeds, groupCall);

    return {
      isAdmin: roomMember.powerLevel >= 100,
      talkOverEnabled: false,
      pttButtonHeld: false,
      activeSpeakerUserId: activeSpeakerFeed ? activeSpeakerFeed.userId : null,
      transmitBlocked: false,
    };
  });

  const onMuteStateChanged = useCallback(() => {
    const activeSpeakerFeed = getActiveSpeakerFeed(userMediaFeeds, groupCall);

    let blocked = false;
    if (activeSpeakerUserId === null && activeSpeakerFeed !== null) {
      if (activeSpeakerFeed.userId === client.getUserId()) {
        playClip(PTTClipID.START_TALKING_LOCAL);
      } else {
        playClip(PTTClipID.START_TALKING_REMOTE);
      }
    } else if (activeSpeakerUserId !== null && activeSpeakerFeed === null) {
      playClip(PTTClipID.END_TALKING);
    } else if (
      pttButtonHeld &&
      activeSpeakerUserId === client.getUserId() &&
      activeSpeakerFeed?.userId !== client.getUserId()
    ) {
      // We were talking but we've been cut off: mute our own mic
      // (this is the easier way of cutting other speakers off if an
      // admin barges in: we could also mute the non-admin speaker
      // on all receivers, but we'd have to make sure we unmuted them
      // correctly.)
      setMicMuteWrapper(true);
      blocked = true;
      playClip(PTTClipID.BLOCKED);
    }

    setState((prevState) => {
      return {
        ...prevState,
        activeSpeakerUserId: activeSpeakerFeed
          ? activeSpeakerFeed.userId
          : null,
        transmitBlocked: blocked,
      };
    });
  }, [
    playClip,
    groupCall,
    pttButtonHeld,
    activeSpeakerUserId,
    client,
    userMediaFeeds,
    setMicMuteWrapper,
  ]);

  useEffect(() => {
    for (const callFeed of userMediaFeeds) {
      callFeed.addListener(CallFeedEvent.MuteStateChanged, onMuteStateChanged);
    }

    const activeSpeakerFeed = getActiveSpeakerFeed(userMediaFeeds, groupCall);

    setState((prevState) => ({
      ...prevState,
      activeSpeakerUserId: activeSpeakerFeed ? activeSpeakerFeed.userId : null,
    }));

    return () => {
      for (const callFeed of userMediaFeeds) {
        callFeed.removeListener(
          CallFeedEvent.MuteStateChanged,
          onMuteStateChanged
        );
      }
    };
  }, [userMediaFeeds, onMuteStateChanged, groupCall]);

  const startTalking = useCallback(async () => {
    if (pttButtonHeld) return;

    let blocked = false;
    if (activeSpeakerUserId && !(isAdmin && talkOverEnabled)) {
      playClip(PTTClipID.BLOCKED);
      blocked = true;
    }
    // setstate before doing the async call to mute / unmute the mic
    setState((prevState) => ({
      ...prevState,
      pttButtonHeld: true,
      transmitBlocked: blocked,
    }));

    if (!blocked && groupCall.isMicrophoneMuted()) {
      setMicMuteWrapper(false);
    }
  }, [
    pttButtonHeld,
    groupCall,
    activeSpeakerUserId,
    isAdmin,
    talkOverEnabled,
    setState,
    playClip,
    setMicMuteWrapper,
  ]);

  const stopTalking = useCallback(async () => {
    setState((prevState) => ({
      ...prevState,
      pttButtonHeld: false,
      transmitBlocked: false,
    }));

    setMicMuteWrapper(true);
  }, [setMicMuteWrapper]);

  // separate state for connected: we set it separately from other things
  // in the client sync callback
  const [connected, setConnected] = useState(true);

  const onClientSync = useCallback(
    (syncState: SyncState) => {
      setConnected(syncState !== SyncState.Error);
    },
    [setConnected]
  );

  const onCharatceristicChange = useCallback(async () => {
    const val = await characteristics[0].value;
    const strval = new TextDecoder("utf-8").decode(val);

    if (globalButtonHeld && strval.startsWith("+PTT=R")) {
      stopTalking();
    } else if (!globalButtonHeld && strval.startsWith("+PTT=P")) {
      startTalking();
    }

    //setTimeout(async () => {
    //console.log(e);
    //return;

    //onCharatceristicChange();
    //}, 200);
  }, [startTalking, stopTalking]);

  useEffect(() => {
    if (btsetupdone) return;
    btsetupdone = true;
    async function doBluetooth() {
      try {
        const device = await navigator.bluetooth.requestDevice({
          //filters: [{ services: ["00006666-0000-1000-8000-00805f9b34fb"] }],
          filters: [{ services: [0x6666] }],
          //optionalServices: [0x6666],
          //acceptAllDevices: true,
        });
        console.log(device);
        console.log("connecting ble");
        const connectedServer = await device.gatt.connect();
        console.log("connected", connectedServer);
        const service = await connectedServer.getPrimaryService(
          //"00006666-0000-1000-8000-00805f9b34fb"
          0x6666
        );
        console.log(service);
        characteristics = await service.getCharacteristics();
        console.log("characteristics: ", characteristics);

        //let readProm = Promise.resolve();

        console.log("starting notifs");
        await characteristics[0].startNotifications();
        characteristics[0].oncharacteristicvaluechanged =
          onCharatceristicChange;
        console.log("listener added");

        //setInterval(onCharatceristicChange, 5000);
        //onCharatceristicChange();
      } catch (e) {
        console.log("error setting up ble ptt", e);
      }
    }
    doBluetooth();
  }, [pttButtonHeld, startTalking, stopTalking, onCharatceristicChange]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.code === "Space") {
        if (!enablePTTButton) return;

        event.preventDefault();

        if (pttButtonHeld) return;

        startTalking();
      }
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (event.code === "Space") {
        event.preventDefault();

        stopTalking();
      }
    }

    function onBlur(): void {
      // TODO: We will need to disable this for a global PTT hotkey to work
      if (!groupCall.isMicrophoneMuted()) {
        setMicMuteWrapper(true);
      }

      setState((prevState) => ({ ...prevState, pttButtonHeld: false }));
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    client.on(ClientEvent.Sync, onClientSync);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);

      client.removeListener(ClientEvent.Sync, onClientSync);
    };
  }, [
    groupCall,
    startTalking,
    stopTalking,
    activeSpeakerUserId,
    isAdmin,
    talkOverEnabled,
    pttButtonHeld,
    enablePTTButton,
    setMicMuteWrapper,
    client,
    onClientSync,
  ]);

  const setTalkOverEnabled = useCallback((talkOverEnabled) => {
    setState((prevState) => ({
      ...prevState,
      talkOverEnabled,
    }));
  }, []);

  globalButtonHeld = pttButtonHeld;

  return {
    pttButtonHeld,
    isAdmin,
    talkOverEnabled,
    setTalkOverEnabled,
    activeSpeakerUserId,
    startTalking,
    stopTalking,
    transmitBlocked,
    connected,
  };
};
