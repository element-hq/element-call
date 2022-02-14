import matrix from "matrix-js-sdk/src/browser-index";
import {
  GroupCallIntent,
  GroupCallType,
} from "matrix-js-sdk/src/browser-index";

export const defaultHomeserver =
  import.meta.env.VITE_DEFAULT_HOMESERVER ||
  `${window.location.protocol}//${window.location.host}`;

export const defaultHomeserverHost = new URL(defaultHomeserver).host;

function waitForSync(client) {
  return new Promise((resolve, reject) => {
    const onSync = (state, _old, data) => {
      if (state === "PREPARED") {
        resolve();
        client.removeListener("sync", onSync);
      } else if (state === "ERROR") {
        reject(data?.error);
        client.removeListener("sync", onSync);
      }
    };
    client.on("sync", onSync);
  });
}

export async function initClient(clientOptions) {
  const client = matrix.createClient({
    ...clientOptions,
    useAuthorizationHeader: true,
  });

  await client.startClient({
    // dirty hack to reduce chance of gappy syncs
    // should be fixed by spotting gaps and backpaginating
    initialSyncLimit: 50,
  });

  await waitForSync(client);

  return client;
}

export function roomAliasFromRoomName(roomName) {
  return roomName
    .trim()
    .replace(/\s/g, "-")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
}

export function roomNameFromRoomId(roomId) {
  return roomId
    .match(/([^:]+):.*$/)[1]
    .substring(1)
    .split("-")
    .map((part) =>
      part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part
    )
    .join(" ");
}

export function isLocalRoomId(roomId) {
  if (!roomId) {
    return false;
  }

  const parts = roomId.match(/[^:]+:(.*)$/);

  if (parts.length < 2) {
    return false;
  }

  return parts[1] === defaultHomeserverHost;
}

export async function createRoom(client, name) {
  const { room_id, room_alias } = await client.createRoom({
    visibility: "private",
    preset: "public_chat",
    name,
    room_alias_name: roomAliasFromRoomName(name),
    power_level_content_override: {
      invite: 100,
      kick: 100,
      ban: 100,
      redact: 50,
      state_default: 0,
      events_default: 0,
      users_default: 0,
      events: {
        "m.room.power_levels": 100,
        "m.room.history_visibility": 100,
        "m.room.tombstone": 100,
        "m.room.encryption": 100,
        "m.room.name": 50,
        "m.room.message": 0,
        "m.room.encrypted": 50,
        "m.sticker": 50,
        "org.matrix.msc3401.call.member": 0,
      },
      users: {
        [client.getUserId()]: 100,
      },
    },
  });

  await client.createGroupCall(
    room_id,
    GroupCallType.Video,
    GroupCallIntent.Prompt
  );

  return room_alias || room_id;
}

export function getRoomUrl(roomId) {
  if (roomId.startsWith("#")) {
    const [localPart, host] = roomId.replace("#", "").split(":");

    if (host !== defaultHomeserverHost) {
      return `${window.location.host}/room/${roomId}`;
    } else {
      return `${window.location.host}/${localPart}`;
    }
  } else {
    return `${window.location.host}/room/${roomId}`;
  }
}

export function getAvatarUrl(client, mxcUrl, avatarSize = 96) {
  const width = Math.floor(avatarSize * window.devicePixelRatio);
  const height = Math.floor(avatarSize * window.devicePixelRatio);
  return mxcUrl && client.mxcUrlToHttp(mxcUrl, width, height, "crop");
}
