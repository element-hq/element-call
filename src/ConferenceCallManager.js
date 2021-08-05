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
    const localUserId = client.getUserId();
    this.localParticipant = {
      local: true,
      userId: localUserId,
      stream: null,
      call: null,
      muted: true,
    };
    this.participants = [this.localParticipant];
    this.pendingCalls = [];

    this.client.on("RoomState.members", this._onMemberChanged);
    this.client.on("Call.incoming", this._onIncomingCall);
    this.callDebugger = new ConferenceCallDebugger(this);
  }

  setRoom(roomId) {
    this.roomId = roomId;
    this.room = this.client.getRoom(this.roomId);
  }

  async join() {
    const mediaStream = await this.client.getLocalVideoStream();

    this.localParticipant.stream = mediaStream;

    this.joined = true;

    this.emit("debugstate", this.client.getUserId(), null, "you");

    const activeConf = this.room.currentState
      .getStateEvents(CONF_ROOM, "")
      ?.getContent()?.active;

    if (!activeConf) {
      this.client.sendStateEvent(this.roomId, CONF_ROOM, { active: true }, "");
    }

    const roomMemberIds = this.room.getMembers().map(({ userId }) => userId);

    roomMemberIds.forEach((userId) => {
      this._processMember(userId);
    });

    for (const { call, onHangup, onReplaced } of this.pendingCalls) {
      if (call.roomId !== this.roomId) {
        continue;
      }

      call.removeListener("hangup", onHangup);
      call.removeListener("replaced", onReplaced);
      const userId = call.opponentMember.userId;
      this._addCall(call, userId);
      call.answer();
      this.emit("call", call);
    }

    this.pendingCalls = [];

    this._updateParticipantState();
  }

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
      this.emit("debugstate", userId, null, "inactive");
      return;
    }

    // Only initiate a call with a user who has a userId that is lexicographically
    // less than your own. Otherwise, that user will call you.
    if (userId < localUserId) {
      this.emit("debugstate", userId, null, "waiting for invite");
      return;
    }

    const call = this.client.createCall(this.roomId, userId);
    this._addCall(call, userId);
    call.placeVideoCall().then(() => {
      this.emit("call", call);
    });
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
    call.answer();
    this.emit("call", call);
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
      stream: null,
      call,
    });

    call.on("state", (state) =>
      this.emit("debugstate", userId, call.callId, state)
    );
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
    for (const participant of this.participants) {
      if (participant.local || participant.call !== call) {
        continue;
      }

      const remoteFeeds = call.getRemoteFeeds();

      if (
        remoteFeeds.length > 0 &&
        participant.stream !== remoteFeeds[0].stream
      ) {
        participant.stream = remoteFeeds[0].stream;
        this.emit("participants_changed");
      }
    }
  };

  _onCallHangup = (call) => {
    const participantIndex = this.participants.findIndex(
      (p) => !p.local && p.call === call
    );

    if (call.hangupReason === "replaced") {
      return;
    }

    if (participantIndex === -1) {
      return;
    }

    this.participants.splice(participantIndex, 1);

    this.emit("participants_changed");
  };

  _onCallReplaced = (call, newCall) => {
    const remoteParticipant = this.participants.find(
      (p) => !p.local && p.call === call
    );

    remoteParticipant.call = newCall;
    this.emit("call", newCall);

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

    this.client.stopLocalMediaStream();

    this.joined = false;
    this.participants = [this.localParticipant];
    this.localParticipant.stream = null;
    this.localParticipant.call = null;

    this.emit("participants_changed");
  }

  logout() {
    localStorage.removeItem("matrix-auth-store");
  }
}
