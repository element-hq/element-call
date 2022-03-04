import React from "react";
import { useLoadGroupCall } from "./useLoadGroupCall";
import { ErrorView, FullScreenView } from "../FullScreenView";
import { usePageTitle } from "../usePageTitle";

export function GroupCallLoader({ client, roomId, viaServers, children }) {
  const { loading, error, groupCall } = useLoadGroupCall(
    client,
    roomId,
    viaServers,
    true
  );

  usePageTitle(groupCall ? groupCall.room.name : "Loading...");

  if (loading) {
    return (
      <FullScreenView>
        <h1>Loading room...</h1>
      </FullScreenView>
    );
  }

  if (error) {
    return <ErrorView error={error} />;
  }

  return children(groupCall);
}
