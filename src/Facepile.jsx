import React from "react";
import styles from "./Facepile.module.css";
import classNames from "classnames";
import { Avatar, sizes } from "./Avatar";

const overlapMap = {
  xs: 2,
  sm: 4,
  md: 8,
};

export function Facepile({
  className,
  client,
  participants,
  max,
  size,
  ...rest
}) {
  const _size = sizes.get(size);
  const _overlap = overlapMap[size];

  return (
    <div
      className={classNames(styles.facepile, styles[size], className)}
      title={participants.map((member) => member.name).join(", ")}
      style={{
        width:
          Math.min(participants.length, max + 1) * (_size - _overlap) +
          _overlap,
      }}
      {...rest}
    >
      {participants.slice(0, max).map((member, i) => {
        const avatarUrl = member.user?.avatarUrl;
        return (
          <Avatar
            key={member.userId}
            size={size}
            src={avatarUrl}
            fallback={member.name.slice(0, 1).toUpperCase()}
            className={styles.avatar}
            style={{ left: i * (_size - _overlap) }}
          />
        );
      })}
      {participants.length > max && (
        <Avatar
          key="additional"
          size={size}
          fallback={`+${participants.length - max}`}
          className={styles.avatar}
          style={{ left: max * (_size - _overlap) }}
        />
      )}
    </div>
  );
}

Facepile.defaultProps = {
  max: 3,
  size: "xs",
};
