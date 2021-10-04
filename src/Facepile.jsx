import React from "react";
import styles from "./Facepile.module.css";
import ColorHash from "color-hash";

const colorHash = new ColorHash({ lightness: 0.3 });

export function Facepile({ participants }) {
  console.log(participants);
  return (
    <div
      className={styles.facepile}
      title={participants.map((member) => member.name).join(", ")}
    >
      {participants.map((member) => (
        <div
          className={styles.avatar}
          style={{ backgroundColor: colorHash.hex(member.name) }}
        >
          <span>{member.name.slice(0, 1).toUpperCase()}</span>
        </div>
      ))}
    </div>
  );
}
