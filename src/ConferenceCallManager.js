/*
Copyright 2021 New Vector Ltd

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

import EventEmitter from "events";
import { ConferenceCallDebugger } from "./ConferenceCallDebugger";
import { randomString } from "./randomstring";

const CONF_ROOM = "me.robertlong.conf";
const CONF_PARTICIPANT = "me.robertlong.conf.participant";
const PARTICIPANT_TIMEOUT = 1000 * 5;

function waitForSync(client) {
  return new Promise((resolve, reject) => {
    const onSync = (state) => {
      if (state === "PREPARED") {
        resolve();
        client.removeListener("sync", onSync);
      }
    };
    client.on("sync", onSync);
  });
}

export class ConferenceCallManager extends EventEmitter {
  static async restore(homeserverUrl) {
    try {
      const authStore = localStorage.getItem("matrix-auth-store");

      if (authStore) {
        const { user_id, device_id, access_token } = JSON.parse(authStore);

        const client = matrixcs.createClient({
          baseUrl: homeserverUrl,
          accessToken: access_token,
          userId: user_id,
          deviceId: device_id,
        });

        const manager = new ConferenceCallManager(client);

        await client.startClient();

        await waitForSync(client);

        return manager;
      }
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");
      throw err;
    }
  }

  static async login(homeserverUrl, username, password) {
    try {
      const registrationClient = matrixcs.createClient(homeserverUrl);

      const { user_id, device_id, access_token } =
        await registrationClient.loginWithPassword(username, password);

      const client = matrixcs.createClient({
        baseUrl: homeserverUrl,
        accessToken: access_token,
        userId: user_id,
        deviceId: device_id,
      });

      localStorage.setItem(
        "matrix-auth-store",
        JSON.stringify({ user_id, device_id, access_token })
      );

      const manager = new ConferenceCallManager(client);

      await client.startClient();

      await waitForSync(client);

      return manager;
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");

      throw err;
    }
  }

  static async register(homeserverUrl, username, password) {
    try {
      const registrationClient = matrixcs.createClient(homeserverUrl);

      const { user_id, device_id, access_token } =
        await registrationClient.register(username, password, null, {
          type: "m.login.dummy",
        });

      const client = matrixcs.createClient({
        baseUrl: homeserverUrl,
        accessToken: access_token,
        userId: user_id,
        deviceId: device_id,
      });

      localStorage.setItem(
        "matrix-auth-store",
        JSON.stringify({ user_id, device_id, access_token })
      );

      const manager = new ConferenceCallManager(client);

      await client.startClient();

      await waitForSync(client);

      return manager;
    } catch (err) {
      localStorage.removeItem("matrix-auth-store");

      throw err;
    }
  }

  constructor(client) {
    super();

    this.client = client;

    this.room = null;

    // The session id is used to re-initiate calls if the user's participant
    // session id has changed
    this.sessionId = randomString(16);

    this._memberParticipantStateTimeout = null;

    // Whether or not we have entered the conference call.
    this.entered = false;

    // The MatrixCalls that were picked up by the Call.incoming listener,
    // before the user entered the conference call.
    this._incomingCallQueue = [];

    // A representation of the conference call data for each room member
    // that has entered the call.
    this.participants = [];

    this.localParticipant = null;

    this.client.on("RoomState.members", this._onRoomStateMembers);
    this.client.on("Call.incoming", this._onIncomingCall);
    this.callDebugger = new ConferenceCallDebugger(this);
  }

  async enter(roomId, timeout = 30000) {
    // Ensure that we have joined the provided room.
    await this.client.joinRoom(roomId);

    // Get the room info, wait if it hasn't been fetched yet.
    // Timeout after 30 seconds or the provided duration.
    const room = await new Promise((resolve, reject) => {
      const initialRoom = this.client.getRoom(roomId);

      if (initialRoom) {
        resolve(initialRoom);
        return;
      }

      const roomTimeout = setTimeout(() => {
        reject(new Error("Room could not be found."));
      }, timeout);

      const roomCallback = (room) => {
        if (room && room.roomId === roomId) {
          this.client.removeListener("Room", roomCallback);
          clearTimeout(roomTimeout);
          resolve(room);
        }
      };

      this.client.on("Room", roomCallback);
    });

    this.room = room;

    // Ensure that this room is marked as a conference room so clients can react appropriately
    const activeConf = room.currentState
      .getStateEvents(CONF_ROOM, "")
      ?.getContent()?.active;

    if (!activeConf) {
      this.client.sendStateEvent(room.roomId, CONF_ROOM, { active: true }, "");
    }

    // Request permissions and get the user's webcam/mic stream if we haven't yet.
    const userId = this.client.getUserId();
    const stream = await this.client.getLocalVideoStream();

    this.localParticipant = {
      local: true,
      userId,
      sessionId: this.sessionId,
      call: null,
      stream,
    };

    this.participants.push(this.localParticipant);
    this.emit("debugstate", userId, null, "you");

    // Announce to the other room members that we have entered the room.
    // Continue doing so every PARTICIPANT_TIMEOUT ms
    this._updateMemberParticipantState();

    this.entered = true;

    // Answer any pending incoming calls.
    const incomingCallCount = this._incomingCallQueue.length;

    for (let i = 0; i < incomingCallCount; i++) {
      const call = this._incomingCallQueue.pop();
      this._onIncomingCall(call);
    }

    // Set up participants for the members currently in the room.
    // Other members will be picked up by the RoomState.members event.
    const initialMembers = room.getMembers();

    for (const member of initialMembers) {
      this._onMemberChanged(member);
    }

    this.emit("entered");
    this.emit("participants_changed");
  }

  leaveCall() {
    if (!this.entered) {
      return;
    }

    const userId = this.client.getUserId();
    const currentMemberState = this.room.currentState.getStateEvents(
      "m.room.member",
      userId
    );

    this.client.sendStateEvent(
      this.room.roomId,
      "m.room.member",
      {
        ...currentMemberState.getContent(),
        [CONF_PARTICIPANT]: null,
      },
      userId
    );

    for (const participant of this.participants) {
      if (!participant.local && participant.call) {
        participant.call.hangup("user_hangup", false);
      }
    }

    this.client.stopLocalMediaStream();

    this.entered = false;
    this.participants = [this.localParticipant];
    this.localParticipant.stream = null;
    this.localParticipant.call = null;
    clearTimeout(this._memberParticipantStateTimeout);

    this.emit("participants_changed");
  }

  logout() {
    localStorage.removeItem("matrix-auth-store");
  }

  /**
   * Call presence
   */

  _updateMemberParticipantState = () => {
    const userId = this.client.getUserId();
    const currentMemberState = this.room.currentState.getStateEvents(
      "m.room.member",
      userId
    );

    this.client.sendStateEvent(
      this.room.roomId,
      "m.room.member",
      {
        ...currentMemberState.getContent(),
        [CONF_PARTICIPANT]: {
          sessionId: this.sessionId,
          expiresAt: new Date().getTime() + PARTICIPANT_TIMEOUT * 2,
        },
      },
      userId
    );

    const now = new Date().getTime();

    for (const participant of this.participants) {
      if (participant.local) {
        continue;
      }

      const memberStateEvent = this.room.currentState.getStateEvents(
        "m.room.member",
        participant.userId
      );
      const participantInfo = memberStateEvent.getContent()[CONF_PARTICIPANT];

      if (
        !participantInfo ||
        (participantInfo.expiresAt && participantInfo.expiresAt < now)
      ) {
        this.emit("debugstate", participant.userId, null, "inactive");

        if (participant.call) {
          // NOTE: This should remove the participant on the next tick
          // since matrix-js-sdk awaits a promise before firing user_hangup
          participant.call.hangup("user_hangup", false);
        }

        return;
      }
    }

    this._memberParticipantStateTimeout = setTimeout(
      this._updateMemberParticipantState,
      PARTICIPANT_TIMEOUT
    );
  };

  /**
   * Call Setup
   *
   * There are two different paths for calls to be created:
   * 1. Incoming calls triggered by the Call.incoming event.
   * 2. Outgoing calls to the initial members of a room or new members
   *    as they are observed by the RoomState.members event.
   */

  _onIncomingCall = (call) => {
    // If we haven't entered yet, add the call to a queue which we'll use later.
    if (!this.entered) {
      this._incomingCallQueue.push(call);
      return;
    }

    // The incoming calls may be for another room, which we will ignore.
    if (call.roomId !== this.room.roomId) {
      return;
    }

    if (call.state !== "ringing") {
      console.warn("Incoming call no longer in ringing state. Ignoring.");
      return;
    }

    // Get the remote video stream if it exists.
    const stream = call.getRemoteFeeds()[0]?.stream;

    const userId = call.opponentMember.userId;

    const memberStateEvent = this.room.currentState.getStateEvents(
      "m.room.member",
      userId
    );
    const { sessionId } = memberStateEvent.getContent()[CONF_PARTICIPANT];

    // Check if the user calling has an existing participant and use this call instead.
    const existingParticipant = this.participants.find(
      (p) => p.userId === userId
    );

    let participant;

    if (existingParticipant) {
      participant = existingParticipant;
      // This also fires the hangup event and triggers those side-effects
      existingParticipant.call.hangup("replaced", false);
      existingParticipant.call = call;
      existingParticipant.stream = stream;
      existingParticipant.sessionId = sessionId;
    } else {
      participant = {
        local: false,
        userId,
        sessionId,
        call,
        stream,
      };
      this.participants.push(participant);
    }

    call.on("state", (state) =>
      this._onCallStateChanged(participant, call, state)
    );
    call.on("feeds_changed", () => this._onCallFeedsChanged(participant, call));
    call.on("replaced", (newCall) =>
      this._onCallReplaced(participant, call, newCall)
    );
    call.on("hangup", () => this._onCallHangup(participant, call));
    call.answer();

    this.emit("call", call);
    this.emit("participants_changed");
  };

  _onRoomStateMembers = (_event, _state, member) => {
    this._onMemberChanged(member);
  };

  _onMemberChanged = (member) => {
    // Don't process new members until we've entered the conference call.
    if (!this.entered) {
      return;
    }

    // The member events may be received for another room, which we will ignore.
    if (member.roomId !== this.room.roomId) {
      return;
    }

    // Don't process your own member.
    const localUserId = this.client.getUserId();

    if (member.userId === localUserId) {
      return;
    }

    // Get the latest member participant state event.
    const memberStateEvent = this.room.currentState.getStateEvents(
      "m.room.member",
      member.userId
    );
    const participantInfo = memberStateEvent.getContent()[CONF_PARTICIPANT];

    if (!participantInfo) {
      return;
    }

    const { expiresAt, sessionId } = participantInfo;

    // If the participant state has expired, ignore this user.
    const now = new Date().getTime();

    if (expiresAt < now) {
      this.emit("debugstate", member.userId, null, "inactive");
      return;
    }

    // If there is an existing participant for this member check the session id.
    // If the session id changed then we can hang up the old call and start a new one.
    // Otherwise, ignore the member change event because we already have an active participant.
    let participant = this.participants.find((p) => p.userId === member.userId);

    if (participant) {
      if (participant.sessionId !== sessionId) {
        this.emit("debugstate", member.userId, null, "inactive");
        participant.call.hangup("replaced", false);
      } else {
        return;
      }
    }

    // Only initiate a call with a user who has a userId that is lexicographically
    // less than your own. Otherwise, that user will call you.
    if (member.userId < localUserId) {
      this.emit("debugstate", member.userId, null, "waiting for invite");
      return;
    }

    const call = this.client.createCall(this.room.roomId, member.userId);

    if (participant) {
      participant.sessionId = sessionId;
      participant.call = call;
      participant.stream = null;
    } else {
      participant = {
        local: false,
        userId: member.userId,
        sessionId,
        call,
        stream: null,
      };
      this.participants.push(participant);
    }

    call.on("state", (state) =>
      this._onCallStateChanged(participant, call, state)
    );
    call.on("feeds_changed", () => this._onCallFeedsChanged(participant, call));
    call.on("replaced", (newCall) =>
      this._onCallReplaced(participant, call, newCall)
    );
    call.on("hangup", () => this._onCallHangup(participant, call));

    call.placeVideoCall().then(() => {
      this.emit("call", call);
    });

    this.emit("participants_changed");
  };

  /**
   * Call Event Handlers
   */

  _onCallStateChanged = (participant, call, state) => {
    this.emit("debugstate", participant.userId, call.callId, state);
  };

  _onCallFeedsChanged = (participant, call) => {
    const feeds = call.getRemoteFeeds();

    if (feeds.length > 0 && participant.stream !== feeds[0].stream) {
      participant.stream = feeds[0].stream;
      this.emit("participants_changed");
    }
  };

  _onCallReplaced = (participant, call, newCall) => {
    participant.call = newCall;

    newCall.on("state", (state) =>
      this._onCallStateChanged(participant, newCall, state)
    );
    newCall.on("feeds_changed", () =>
      this._onCallFeedsChanged(participant, newCall)
    );
    newCall.on("replaced", (nextCall) =>
      this._onCallReplaced(participant, newCall, nextCall)
    );
    newCall.on("hangup", () => this._onCallHangup(participant, newCall));

    const feeds = newCall.getRemoteFeeds();

    if (feeds.length > 0) {
      participant.stream = feeds[0].stream;
    }

    this.emit("call", newCall);
    this.emit("participants_changed");
  };

  _onCallHangup = (participant, call) => {
    if (call.hangupReason === "replaced") {
      return;
    }

    const participantIndex = this.participants.indexOf(participant);

    if (participantIndex === -1) {
      return;
    }

    this.participants.splice(participantIndex, 1);

    this.emit("participants_changed");
  };
}
