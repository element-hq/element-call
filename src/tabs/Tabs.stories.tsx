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

import React from "react";

import { TabContainer, TabItem } from "./Tabs";
import { ReactComponent as AudioIcon } from "../icons/Audio.svg";
import { ReactComponent as VideoIcon } from "../icons/Video.svg";
import { ReactComponent as DeveloperIcon } from "../icons/Developer.svg";
import { Body } from "../typography/Typography";

export default {
  title: "Tabs",
  component: TabContainer,
  parameters: {
    layout: "fullscreen",
  },
};

export const Tabs = () => (
  <TabContainer>
    <TabItem
      title={
        <>
          <AudioIcon width={16} height={16} />
          <Body>Audio</Body>
        </>
      }
    >
      Audio Tab Content
    </TabItem>
    <TabItem
      title={
        <>
          <VideoIcon width={16} height={16} />
          <Body>Video</Body>
        </>
      }
    >
      Video Tab Content
    </TabItem>
    <TabItem
      title={
        <>
          <DeveloperIcon width={16} height={16} />
          <Body>Developer</Body>
        </>
      }
    >
      Developer Tab Content
    </TabItem>
  </TabContainer>
);
