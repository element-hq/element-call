/*
Copyright 2023 New Vector Ltd

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

import { animated } from "@react-spring/web";
import classNames from "classnames";
import { ComponentProps, forwardRef, Ref } from "react"
import { Avatar } from "../Avatar";
import { ReactComponent as HangupIcon } from "../icons/Hangup.svg";
import { ReactComponent as ScreenshareIcon } from "../icons/Screenshare.svg";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import styles from "./FakeVideoTile.module.css";


export interface FakeItemData {
  type: "fake", // To differentiate from ItemData
  name: string,
  screenshare: boolean,
  speaking: boolean,
  simulateScreenshare?: () => void
  simulateSpeaking?: () => void
  remove: () => void
}

interface Props {
  data: FakeItemData
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
}

export const FakeVideoTile = forwardRef<HTMLElement, Props>(({ data, className, style }, ref) => {
  return <animated.div className={classNames(className, styles.tile, { [styles.speaking]: data.speaking })} ref={ref as Ref<HTMLDivElement>} style={style}>
    <Avatar fallback={data.name[0].toUpperCase()} />
    <div className={styles.name}>
      {data.screenshare ? `${data.name} (sharing screen)` : data.name}
    </div>
    <div className={styles.buttons}>
      {data.simulateSpeaking && <MicIcon onClick={data.simulateSpeaking} />}
      {data.simulateScreenshare && <ScreenshareIcon onClick={data.simulateScreenshare} />}
      <HangupIcon onClick={data.remove} />
    </div>
  </animated.div>
})
