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
