/*
Copyright 2022 New Vector Ltd

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

  // make sure the feeds are in a deterministic order so every client picks
  // the same one as the active speaker. The custom sort function sorts
  // by user ID, so needs a collator of some kind to compare. We make a
  // specific one to help ensure every client sorts the same way
  // although of course user IDs shouldn't contain accented characters etc.
  // anyway).
  const collator = new Intl.Collator("en", {
    sensitivity: "variant",
    usage: "sort",
    ignorePunctuation: false,
  });
  activeSpeakerFeeds.sort((a: CallFeed, b: CallFeed): number =>
    collator.compare(a.userId, b.userId)
  );

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
  activeSpeakerVolume: number;
  startTalking: () => void;
  stopTalking: () => void;
  transmitBlocked: boolean;
  // connected is actually an indication of whether we're connected to the HS
  // (ie. the client's syncing state) rather than media connection, since
  // it's peer to peer so we can't really say which peer is 'disconnected' if
  // there's only one other person in the call and they've lost Internet.
  connected: boolean;
}

export const usePTT = (
  client: MatrixClient,
  groupCall: GroupCall,
  userMediaFeeds: CallFeed[],
  playClip: PlayClipFunction
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
      activeSpeakerVolume,
      transmitBlocked,
    },
    setState,
  ] = useState(() => {
    // slightly concerningly, this can end up null as we seem to sometimes get
    // here before the room state contains our own member event
    const roomMember = groupCall.room.getMember(client.getUserId());

    const activeSpeakerFeed = getActiveSpeakerFeed(userMediaFeeds, groupCall);

    return {
      isAdmin: roomMember ? roomMember.powerLevel >= 100 : false,
      talkOverEnabled: false,
      pttButtonHeld: false,
      activeSpeakerUserId: activeSpeakerFeed ? activeSpeakerFeed.userId : null,
      activeSpeakerVolume: -Infinity,
      transmitBlocked: false,
    };
  });

  const onMuteStateChanged = useCallback(() => {
    const activeSpeakerFeed = getActiveSpeakerFeed(userMediaFeeds, groupCall);

    let blocked = transmitBlocked;
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
      activeSpeakerFeed?.userId !== client.getUserId() &&
      !transmitBlocked
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

    setState((prevState) => ({
      ...prevState,
      activeSpeakerUserId: activeSpeakerFeed ? activeSpeakerFeed.userId : null,
      transmitBlocked: blocked,
    }));
  }, [
    playClip,
    groupCall,
    pttButtonHeld,
    activeSpeakerUserId,
    client,
    userMediaFeeds,
    setMicMuteWrapper,
    transmitBlocked,
  ]);

  useEffect(() => {
    for (const callFeed of userMediaFeeds) {
      callFeed.on(CallFeedEvent.MuteStateChanged, onMuteStateChanged);
    }

    const activeSpeakerFeed = getActiveSpeakerFeed(userMediaFeeds, groupCall);

    setState((prevState) => ({
      ...prevState,
      activeSpeakerUserId: activeSpeakerFeed ? activeSpeakerFeed.userId : null,
    }));

    return () => {
      for (const callFeed of userMediaFeeds) {
        callFeed.off(CallFeedEvent.MuteStateChanged, onMuteStateChanged);
      }
    };
  }, [userMediaFeeds, onMuteStateChanged, groupCall]);

  const onVolumeChanged = useCallback((volume: number) => {
    setState((prevState) => ({
      ...prevState,
      activeSpeakerVolume: volume,
    }));
  }, []);

  useEffect(() => {
    const activeSpeakerFeed = getActiveSpeakerFeed(userMediaFeeds, groupCall);
    activeSpeakerFeed?.on(CallFeedEvent.VolumeChanged, onVolumeChanged);
    return () => {
      activeSpeakerFeed?.off(CallFeedEvent.VolumeChanged, onVolumeChanged);
      setState((prevState) => ({
        ...prevState,
        activeSpeakerVolume: -Infinity,
      }));
    };
  }, [activeSpeakerUserId, onVolumeChanged, userMediaFeeds, groupCall]);

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

  useEffect(() => {
    client.on(ClientEvent.Sync, onClientSync);

    return () => {
      client.removeListener(ClientEvent.Sync, onClientSync);
    };
  }, [client, onClientSync]);

  const setTalkOverEnabled = useCallback((talkOverEnabled) => {
    setState((prevState) => ({
      ...prevState,
      talkOverEnabled,
    }));
  }, []);

  return {
    pttButtonHeld,
    isAdmin,
    talkOverEnabled,
    setTalkOverEnabled,
    activeSpeakerUserId,
    activeSpeakerVolume,
    startTalking,
    stopTalking,
    transmitBlocked,
    connected,
  };
};
