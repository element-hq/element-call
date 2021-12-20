import React from "react";
import styles from "./Facepile.module.css";
import classNames from "classnames";
import { Avatar } from "./Avatar";
import { getAvatarUrl } from "./ConferenceCallManagerHooks";

export function Facepile({ className, client, participants, ...rest }) {
  return (
    <div
      className={classNames(styles.facepile, className)}
      title={participants.map((member) => member.name).join(", ")}
      {...rest}
    >
      {participants.slice(0, 3).map((member, i) => {
        const avatarUrl = member.user?.avatarUrl;
        return (
          <Avatar
            key={member.userId}
            size="xs"
            src={avatarUrl && getAvatarUrl(client, avatarUrl, 22)}
            fallback={member.name.slice(0, 1).toUpperCase()}
            className={styles.avatar}
            style={{ left: i * 22 }}
          />
        );
      })}
      {participants.length > 3 && (
        <Avatar
          key="additional"
          size="xs"
          fallback={`+${participants.length - 3}`}
          className={styles.avatar}
          style={{ left: 3 * 22 }}
        />
      )}
    </div>
  );
}
