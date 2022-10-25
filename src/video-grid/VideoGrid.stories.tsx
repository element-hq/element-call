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

import React, { useState } from "react";
import { useMemo } from "react";
import { RoomMember } from "matrix-js-sdk";

import { VideoGrid, useVideoGridLayout } from "./VideoGrid";
import { VideoTile } from "./VideoTile";
import { Button } from "../button";
import { TileDescriptor } from "../room/InCallView";

export default {
  title: "VideoGrid",
  parameters: {
    layout: "fullscreen",
  },
};

export const ParticipantsTest = () => {
  const { layout, setLayout } = useVideoGridLayout(false);
  const [participantCount, setParticipantCount] = useState(1);

  const items: TileDescriptor[] = useMemo(
    () =>
      new Array(participantCount).fill(undefined).map((_, i) => ({
        id: (i + 1).toString(),
        member: new RoomMember("!fake:room.id", `@user${i}:fake.dummy`),
        focused: false,
        presenter: false,
      })),
    [participantCount]
  );

  return (
    <>
      <div style={{ display: "flex", width: "100vw", height: "32px" }}>
        <Button
          onPress={() =>
            setLayout(layout === "freedom" ? "spotlight" : "freedom")
          }
        >
          Toggle Layout
        </Button>
        {participantCount < 12 && (
          <Button onPress={() => setParticipantCount((count) => count + 1)}>
            Add Participant
          </Button>
        )}
        {participantCount > 0 && (
          <Button onPress={() => setParticipantCount((count) => count - 1)}>
            Remove Participant
          </Button>
        )}
      </div>
      <div
        style={{
          display: "flex",
          width: "100vw",
          height: "calc(100vh - 32px)",
        }}
      >
        <VideoGrid layout={layout} items={items}>
          {({ item, ...rest }) => (
            <VideoTile
              key={item.id}
              name={`User ${item.id}`}
              disableSpeakingIndicator={items.length < 3}
              hasFeed={true}
              {...rest}
            />
          )}
        </VideoGrid>
      </div>
    </>
  );
};

ParticipantsTest.args = {
  layout: "freedom",
  participantCount: 1,
};
