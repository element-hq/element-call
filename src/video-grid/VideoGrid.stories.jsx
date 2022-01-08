import React, { useState } from "react";
import VideoGrid from "matrix-react-sdk/src/components/views/voip/GroupCallView/VideoGrid";
import VideoTile from "matrix-react-sdk/src/components/views/voip/GroupCallView/VideoTile";
import "matrix-react-sdk/res/css/views/voip/GroupCallView/_VideoGrid.scss";
import { useMemo } from "react";

export default {
  title: "VideoGrid",
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    layout: {
      options: ["freedom", "spotlight"],
      control: { type: "radio" },
    },
  },
};

export const ParticipantsTest = ({ layout, participantCount }) => {
  const items = useMemo(
    () =>
      new Array(participantCount).fill(undefined).map((_, i) => ({
        id: (i + 1).toString(),
        focused: false,
        presenter: false,
      })),
    [participantCount]
  );

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
      <VideoGrid layout={layout} items={items}>
        {({ item, ...rest }) => (
          <VideoTile key={item.id} name={`User ${item.id}`} {...rest} />
        )}
      </VideoGrid>
    </div>
  );
};

ParticipantsTest.args = {
  layout: "freedom",
  participantCount: 1,
};
