import React from "react";
import { useLoadGroupCall } from "./useLoadGroupCall";
import { ErrorView, FullScreenView } from "../FullScreenView";
import { usePageTitle } from "../usePageTitle";
import { isLocalRoomId } from "../matrix-utils";
import { RoomNotFoundView } from "./RoomNotFoundView";

export function GroupCallLoader({ client, roomId, viaServers, children }) {
  const { loading, error, groupCall } = useLoadGroupCall(
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

  if (error && error.errcode === "M_UNKNOWN" && isLocalRoomId(roomId)) {
    return <RoomNotFoundView client={client} roomId={roomId} />;
  }

  if (error) {
    return <ErrorView error={error} />;
  }

  return children(groupCall);
}
