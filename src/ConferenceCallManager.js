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
    this.joined = false;
    this.room = null;
    this.localParticipant = {
      local: true,
      userId: client.getUserId(),
      feed: null,
      call: null,
      muted: true,
    };
    this.participants = [this.localParticipant];
    this.pendingCalls = [];
    this.callUserMap = new Map();
    this.debugState = new Map();
    this._setDebugState(client.getUserId(), "you");
    this.client.on("event", this._onEvent);
    this.client.on("RoomState.members", this._onMemberChanged);
    this.client.on("Call.incoming", this._onIncomingCall);
  }

  join(roomId) {
    this.joined = true;

    this._addDebugEvent(this.client.getUserId(), "joined call");

    this.roomId = roomId;
    this.room = this.client.getRoom(this.roomId);

    const activeConf = this.room.currentState
      .getStateEvents(CONF_ROOM, "")
      ?.getContent()?.active;

    if (!activeConf) {
      this.client.sendStateEvent(this.roomId, CONF_ROOM, { active: true }, "");
    }

    const roomMemberIds = this.room.getMembers().map(({ userId }) => userId);

    for (const userId of this.debugState.keys()) {
      if (roomMemberIds.indexOf(userId) === -1) {
        this.debugState.delete(userId);
      }
    }

    roomMemberIds.forEach((userId) => {
      this._processMember(userId);
    });

    for (const { call, onHangup, onReplaced } of this.pendingCalls) {
      if (call.roomId !== roomId) {
        continue;
      }

      call.removeListener("hangup", onHangup);
      call.removeListener("replaced", onReplaced);
      const userId = call.opponentMember.userId;
      this._addCall(call, userId);
      call.answer();
    }

    this.pendingCalls = [];

    this._updateParticipantState();
  }

  _onEvent = (event) => {
    const roomId = event.getRoomId();
    const type = event.getType();

    if (type.startsWith("m.call.") || type.startsWith("me.robertlong.conf")) {
      const content = event.getContent();
      const details = { content: event.toJSON(), roomId };

      if (content.invitee && content.call_id) {
        this.callUserMap.set(content.call_id, content.invitee);
        details.to = content.invitee;
      } else if (content.call_id) {
        details.to = this.callUserMap.get(content.call_id);
      }

      switch (type) {
        case "m.call.invite":
        case "m.call.candidates":
        case "m.call.answer":
        case "m.call.hangup":
        case "m.call.select_answer":
          details.callId = content.call_id;
          break;
      }

      this._addDebugEvent(event.getSender(), type, details);
    }
  };

  _updateParticipantState = () => {
    const userId = this.client.getUserId();
    const currentMemberState = this.room.currentState.getStateEvents(
      "m.room.member",
      userId
    );

    this.client.sendStateEvent(
      this.roomId,
      "m.room.member",
      {
        ...currentMemberState.getContent(),
        [CONF_PARTICIPANT]: new Date().getTime(),
      },
      userId
    );

    this._participantStateTimeout = setTimeout(
      this._updateParticipantState,
      PARTICIPANT_TIMEOUT
    );
  };

  _onMemberChanged = (_event, _state, member) => {
    if (member.roomId !== this.roomId) {
      return;
    }

    this._processMember(member.userId);
  };

  _processMember(userId) {
    const localUserId = this.client.getUserId();

    if (userId === localUserId) {
      return;
    }

    // Don't process members until we've joined
    if (!this.joined) {
      return;
    }

    const participant = this.participants.find((p) => p.userId === userId);

    if (participant) {
      // Member has already been processed
      return;
    }

    const memberStateEvent = this.room.currentState.getStateEvents(
      "m.room.member",
      userId
    );
    const participantTimeout = memberStateEvent.getContent()[CONF_PARTICIPANT];

    if (
      typeof participantTimeout !== "number" ||
      new Date().getTime() - participantTimeout > PARTICIPANT_TIMEOUT
    ) {
      // Member is inactive so don't call them.
      this._setDebugState(userId, "inactive");
      return;
    }

    // Only initiate a call with a user who has a userId that is lexicographically
    // less than your own. Otherwise, that user will call you.
    if (userId < localUserId) {
      this._setDebugState(userId, "waiting for invite");
      return;
    }

    const call = this.client.createCall(this.roomId, userId);
    this._addCall(call, userId);
    this._setDebugState(userId, "calling");
    call.placeVideoCall();
  }

  _onIncomingCall = (call) => {
    if (!this.joined) {
      const onHangup = (call) => {
        const index = this.pendingCalls.findIndex((p) => p.call === call);

        if (index !== -1) {
          this.pendingCalls.splice(index, 1);
        }
      };

      const onReplaced = (call, newCall) => {
        const index = this.pendingCalls.findIndex((p) => p.call === call);

        if (index !== -1) {
          this.pendingCalls.splice(index, 1, {
            call: newCall,
            onHangup: () => onHangup(newCall),
            onReplaced: (nextCall) => onReplaced(newCall, nextCall),
          });
        }
      };

      this.pendingCalls.push({
        call,
        onHangup: () => onHangup(call),
        onReplaced: (newCall) => onReplaced(call, newCall),
      });
      call.on("hangup", onHangup);
      call.on("replaced", onReplaced);

      return;
    }

    if (call.roomId !== this.roomId) {
      return;
    }

    const userId = call.opponentMember.userId;
    this._addCall(call, userId);
    this._setDebugState(userId, "answered");
    call.answer();
  };

  _addCall(call, userId) {
    if (call.state === "ended") {
      return;
    }

    const existingCall = this.participants.find(
      (p) => !p.local && p.call && p.call.callId === call.callId
    );

    if (existingCall) {
      return;
    }

    this.participants.push({
      userId,
      feed: null,
      call,
    });

    this._setDebugCallId(userId, call.callId);

    call.on("feeds_changed", () => this._onCallFeedsChanged(call));
    call.on("hangup", () => this._onCallHangup(call));

    const onReplaced = (newCall) => {
      this._onCallReplaced(call, newCall);
      call.removeListener("replaced", onReplaced);
    };

    call.on("replaced", onReplaced);
    this._onCallFeedsChanged(call);

    this.emit("participants_changed");
  }

  _onCallFeedsChanged = (call) => {
    const localFeeds = call.getLocalFeeds();

    let participantsChanged = false;

    if (!this.localParticipant.feed && localFeeds.length > 0) {
      this.localParticipant.call = call;
      this._setDebugCallId(this.localParticipant.userId, call.callId);
      this.localParticipant.feed = localFeeds[0];
      participantsChanged = true;
    }

    const remoteFeeds = call.getRemoteFeeds();
    const remoteParticipant = this.participants.find(
      (p) => !p.local && p.call === call
    );

    if (remoteFeeds.length > 0 && remoteParticipant.feed !== remoteFeeds[0]) {
      remoteParticipant.feed = remoteFeeds[0];
      this._setDebugState(call.opponentMember.userId, "streaming");
      participantsChanged = true;
    }

    if (participantsChanged) {
      this.emit("participants_changed");
    }
  };

  _onCallHangup = (call) => {
    if (call.hangupReason === "replaced") {
      return;
    }

    this._setDebugState(call.opponentMember.userId, "hungup");

    const participantIndex = this.participants.findIndex(
      (p) => !p.local && p.call === call
    );

    if (participantIndex === -1) {
      return;
    }

    this.participants.splice(participantIndex, 1);

    if (this.localParticipant.call === call) {
      const newLocalCallParticipant = this.participants.find(
        (p) => !p.local && p.call
      );

      if (newLocalCallParticipant) {
        const localFeeds = call.getLocalFeeds();

        if (localFeeds.length > 0) {
          this.localParticipant.call = call;
          this._setDebugCallId(this.localParticipant.userId, call.callId);
          this.localParticipant.feed = localFeeds[0];
        } else {
          this.localParticipant.call = null;
          this._setDebugCallId(this.localParticipant.userId, null);
          this.localParticipant.feed = null;
        }
      } else {
        this.localParticipant.call = null;
        this._setDebugCallId(this.localParticipant.userId, null);
        this.localParticipant.feed = null;
      }
    }

    this.emit("participants_changed");
  };

  _onCallReplaced = (call, newCall) => {
    this._addDebugEvent(call.opponentMember.userId, "replaced", {
      callId: call.callId,
      newCallId: newCall.callId,
    });

    const remoteParticipant = this.participants.find(
      (p) => !p.local && p.call === call
    );

    remoteParticipant.call = newCall;
    this._setDebugCallId(remoteParticipant.userId, newCall.callId);

    newCall.on("feeds_changed", () => this._onCallFeedsChanged(newCall));
    newCall.on("hangup", () => this._onCallHangup(newCall));
    newCall.on("replaced", (nextCall) =>
      this._onCallReplaced(newCall, nextCall)
    );
    this._onCallFeedsChanged(newCall);

    this.emit("participants_changed");
  };

  leaveCall() {
    if (!this.joined) {
      return;
    }

    const userId = this.client.getUserId();
    const currentMemberState = this.room.currentState.getStateEvents(
      "m.room.member",
      userId
    );

    this.client.sendStateEvent(
      this.roomId,
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

    this.joined = false;
    this.participants = [this.localParticipant];
    this.localParticipant.feed = null;
    this.localParticipant.call = null;
    this._setDebugCallId(this.localParticipant.userId, null);

    this.emit("participants_changed");
  }

  _addDebugEvent(sender, type, content) {
    if (!this.debugState.has(sender)) {
      this.debugState.set(sender, {
        callId: null,
        state: "unknown",
        events: [{ type, ...content }],
      });
    } else {
      const { events } = this.debugState.get(sender);
      events.push({ type, roomId: this.roomId, ...content });
    }

    this.emit("debug");
  }

  _setDebugState(userId, state) {
    if (!this.debugState.has(userId)) {
      this.debugState.set(userId, { state, callId: null, events: [] });
    } else {
      const userState = this.debugState.get(userId);
      userState.state = state;
    }

    this.emit("debug");
  }

  _setDebugCallId(userId, callId) {
    if (!this.debugState.has(userId)) {
      this.debugState.set(userId, { state: "unknown", callId, events: [] });
    } else {
      const userState = this.debugState.get(userId);
      userState.callId = callId;
    }

    this.emit("debug");
  }

  logout() {
    localStorage.removeItem("matrix-auth-store");
  }
}
