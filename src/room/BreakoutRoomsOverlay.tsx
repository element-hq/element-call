/*
Copyright 2023 Šimon Brandner <simon.bra.ag@gmail.com>

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

import { useCallback, useState } from "react";
import { Room } from "matrix-js-sdk";
import { BreakoutRoomsEvent } from "matrix-js-sdk/src/models/breakoutRooms";
import { ExistingBreakoutRoomWithSummary } from "matrix-js-sdk/src/@types/breakout";
import { Avatar } from "@vector-im/compound-web";
import { Link } from "react-router-dom";

import { useTypedEventEmitter } from "../useEvents";
import callListStyles from "../home/CallList.module.css";
import styles from "./BreakoutRoomsOverlay.module.css";
import { getRelativeRoomUrl } from "../matrix-utils";
import { Body } from "../typography/Typography";
import { Size } from "../Avatar";
import { BreakoutRoomsButton } from "../button/Button";

interface Props {
  room: Room;
}

export const BreakoutRoomsOverlay = ({ room }: Props) => {
  const [breakoutRooms, setBreakoutRooms] = useState(room?.getBreakoutRooms());
  const [expanded, setExpanded] = useState(false);

  const onExpandClick = useCallback(() => {
    setExpanded(true);
  }, [setExpanded]);

  const onCollapseClick = useCallback(() => {
    setExpanded(false);
  }, [setExpanded]);

  const onEvent = useCallback((rooms: ExistingBreakoutRoomWithSummary[]) => {
    setBreakoutRooms(rooms);
    setExpanded(true);
  }, []);

  useTypedEventEmitter(room!, BreakoutRoomsEvent.RoomsChanged, onEvent);

  if (!breakoutRooms || breakoutRooms?.length === 0) {
    return null;
  }

  if (!expanded)
    return (
      <div className={styles.breakoutRoomsOverlay}>
        <BreakoutRoomsButton onPress={onExpandClick} />
      </div>
    );

  return (
    <div className={styles.breakoutRoomsOverlay}>
      {breakoutRooms?.map((r) => (
        <div className={`${styles.callTile} ${callListStyles.callTile}`}>
          <Link
            // note we explicitly omit the password here as we don't want it on this link because
            // it's just for the user to navigate around and not for sharing
            to={getRelativeRoomUrl(r.roomId, room.name)}
            className={styles.callTileLink}
          >
            <div className={styles.callTileHead}>
              <Avatar
                id={r.roomId}
                name={r.roomSummary.name!}
                size={Size.XS}
                src={r.roomSummary.avatar_url}
                className={styles.callTileAvatar}
              />
              <div className={`${callListStyles.callInfo} ${styles.callInfo}`}>
                <Body overflowEllipsis fontWeight="semiBold">
                  {r.roomSummary.name}
                </Body>
              </div>
            </div>
            <div className={styles.callTileUsers}>
              {r.users.map((u) => room.getMember(u)?.name)}
            </div>
          </Link>
        </div>
      ))}
      <BreakoutRoomsButton onPress={onCollapseClick} />
    </div>
  );
};
