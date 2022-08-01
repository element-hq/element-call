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

import React, { FC } from "react";
import { Item } from "@react-stately/collections";

import { Headline } from "../typography/Typography";
import { Button } from "../button";
import { PopoverMenuTrigger } from "../popover/PopoverMenu";
import { ReactComponent as VideoIcon } from "../icons/Video.svg";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import { ReactComponent as CheckIcon } from "../icons/Check.svg";
import styles from "./CallTypeDropdown.module.css";
import commonStyles from "./common.module.css";
import menuStyles from "../Menu.module.css";
import { Menu } from "../Menu";

export enum CallType {
  Video = "video",
  Radio = "radio",
}

interface Props {
  callType: CallType;
  setCallType: (value: CallType) => void;
}

export const CallTypeDropdown: FC<Props> = ({ callType, setCallType }) => {
  return (
    <PopoverMenuTrigger placement="bottom">
      <Button variant="dropdown" className={commonStyles.headline}>
        <Headline className={styles.label}>
          {callType === CallType.Video ? "Video call" : "Walkie-talkie call"}
        </Headline>
      </Button>
      {(props: JSX.IntrinsicAttributes) => (
        <Menu {...props} label="Call type menu" onAction={setCallType}>
          <Item key={CallType.Video} textValue="Video call">
            <VideoIcon />
            <span>Video call</span>
            {callType === CallType.Video && (
              <CheckIcon className={menuStyles.checkIcon} />
            )}
          </Item>
          <Item key={CallType.Radio} textValue="Walkie-talkie call">
            <MicIcon />
            <span>Walkie-talkie call</span>
            {callType === CallType.Radio && (
              <CheckIcon className={menuStyles.checkIcon} />
            )}
          </Item>
        </Menu>
      )}
    </PopoverMenuTrigger>
  );
};
