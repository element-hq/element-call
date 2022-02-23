import React from "react";
import { useLoadGroupCall } from "./useLoadGroupCall";
import { ErrorView, FullScreenView } from "../FullScreenView";
import { usePageTitle } from "../usePageTitle";
import { isLocalRoomId } from "../matrix-utils";
import { RoomNotFoundView } from "./RoomNotFoundView";

export function GroupCallLoader({ client, roomId, viaServers, children }) {
  const { loading, error, groupCall, reload } = useLoadGroupCall(
    client,
    roomId,
    viaServers
  );

  usePageTitle(groupCall ? groupCall.room.name : "Loading...");

  if (loading) {
    return (
      <FullScreenView>
        <h1>Loading room...</h1>
      </FullScreenView>
    );
  }

  if (
    error &&
    (error.errcode === "M_NOT_FOUND" ||
      (error.message &&
        error.message.indexOf("Failed to fetch alias") !== -1)) &&
    isLocalRoomId(roomId)
  ) {
    return (
      <RoomNotFoundView client={client} roomId={roomId} onReload={reload} />
    );
  }

  if (error) {
    return <ErrorView error={error} />;
  }

  return children(groupCall);
}
