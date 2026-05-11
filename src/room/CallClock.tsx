/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useEffect, useRef, useState } from "react";

import styles from "./CallClock.module.css";

const pad = (n: number): string => n.toString().padStart(2, "0");

export const CallClock: FC = () => {
  const startedAt = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return (): void => window.clearInterval(id);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - startedAt.current) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const text = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;

  return (
    <div
      className={styles.clock}
      role="timer"
      aria-label="Call duration"
    >
      {text}
    </div>
  );
};
