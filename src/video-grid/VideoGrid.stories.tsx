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

import React, { useState } from "react";

import { useVideoGridLayout } from "./VideoGrid";
import { Button } from "../button";

export default {
  title: "VideoGrid",
  parameters: {
    layout: "fullscreen",
  },
};

const ParticipantsTest = () => {
  const { layout, setLayout } = useVideoGridLayout(false);
  const [participantCount, setParticipantCount] = useState(1);

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
    </>
  );
};

ParticipantsTest.args = {
  layout: "freedom",
  participantCount: 1,
};
