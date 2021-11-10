import React from "react";
import styles from "./Facepile.module.css";
import ColorHash from "color-hash";
import classNames from "classnames";

const colorHash = new ColorHash({ lightness: 0.3 });

export function Facepile({ participants }) {
  return (
    <div
      className={styles.facepile}
      title={participants.map((member) => member.name).join(", ")}
    >
      {participants.slice(0, 3).map((member) => (
        <div
          key={member.userId}
          className={styles.avatar}
          style={{ backgroundColor: colorHash.hex(member.name) }}
        >
          <span>{member.name.slice(0, 1).toUpperCase()}</span>
        </div>
      ))}
      {participants.length > 3 && (
        <div
          key="additional"
          className={classNames(styles.avatar, styles.additional)}
        >
          <span>{`+${participants.length - 3}`}</span>
        </div>
      )}
    </div>
  );
}
