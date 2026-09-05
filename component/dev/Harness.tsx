/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  type FormEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";
import { type MatrixClient } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";

import { ElementCall } from "../index";
import { createDevHostBridge } from "./DevHostBridge";
import { createSession, joinRoom } from "./session";
import styles from "./Harness.module.css";

interface Credentials {
  homeserver: string;
  username: string;
  password: string;
  room: string;
}

const CREDENTIALS_KEY = "element-call-component-harness";

const DEFAULT_CREDENTIALS: Credentials = {
  homeserver: "https://synapse.m.localhost",
  username: "",
  password: "",
  room: "",
};

/**
 * The credentials to start with: the last ones used, so that a reload does not
 * mean typing them again, overridden by anything in the query string.
 *
 * A host reading its own URL is entirely proper — it was Element Call doing so
 * that was the mistake. It lets the end-to-end tests, or a shared link, say
 * which account and room to use.
 */
function loadCredentials(): Credentials {
  let stored: Partial<Credentials> = {};
  try {
    const json = localStorage.getItem(CREDENTIALS_KEY);
    if (json !== null) stored = JSON.parse(json) as Credentials;
  } catch (e) {
    logger.warn("Could not read the stored harness credentials", e);
  }

  const query = new URLSearchParams(location.search);
  const fromUrl = Object.fromEntries(
    (["homeserver", "username", "password", "room"] as const)
      .map((name) => [name, query.get(name)])
      .filter(([, value]) => value !== null),
  ) as Partial<Credentials>;

  return { ...DEFAULT_CREDENTIALS, ...stored, ...fromUrl };
}

interface Session {
  label: string;
  client: MatrixClient;
}

type State =
  | { phase: "credentials" }
  | { phase: "starting"; progress: string }
  | { phase: "started"; roomId: string; sessions: Session[] }
  | { phase: "failed"; error: string };

interface LogEntry {
  pane: string;
  message: string;
  at: string;
}

/**
 * One embedded Element Call, with the controls a host would have over it: the
 * requests it can make of Element Call, and the ability to take it off screen
 * altogether.
 */
const Pane: FC<{
  session: Session;
  roomId: string;
  log: (pane: string, message: string) => void;
}> = ({ session, roomId, log }): ReactNode => {
  const [mounted, setMounted] = useState(true);

  const bridge = useMemo(
    () =>
      createDevHostBridge(
        (message) => log(session.label, message),
        () => setMounted(false),
      ),
    [log, session.label],
  );

  return (
    <section className={styles.pane} data-testid="call-pane">
      <div className={styles.paneBar}>
        <strong>{session.label}</strong>
        <code>{session.client.getDeviceId()}</code>
        <button onClick={(): void => setMounted((m) => !m)}>
          {mounted ? "Unmount" : "Mount"}
        </button>
        <button onClick={(): void => bridge.requestTheme("light")}>
          Light
        </button>
        <button onClick={(): void => bridge.requestTheme("dark")}>Dark</button>
        <button
          onClick={(): void =>
            bridge.requestDeviceMute({ audio_enabled: false })
          }
        >
          Mute
        </button>
        <button onClick={(): void => bridge.requestHangUp()}>Hang up</button>
      </div>
      {/* Resizable, because how Element Call copes with the size it is given is
      one of the things we cannot find out from the standalone app */}
      <div className={styles.paneCall} data-testid="call-container">
        {mounted && (
          <ElementCall
            client={session.client}
            roomId={roomId}
            hostBridge={bridge}
          />
        )}
      </div>
    </section>
  );
};

/** Host furniture, to make it visible if Element Call styles anything but itself. */
const HostChrome: FC = (): ReactNode => (
  <nav className={styles.sidebar}>
    <h2>Host chrome</h2>
    <p>
      This column belongs to the host. If Element Call&apos;s stylesheet reaches
      outside its own container, it shows up here.
    </p>
    <hr />
    <ul>
      <li>Some room</li>
      <li>Another room</li>
    </ul>
    <button>A host button</button>
  </nav>
);

/**
 * A dialog of the host's own, over the top of the calls. Element Call embedded
 * in a host has to sit underneath this — being unable to is one of the reasons
 * for embedding it rather than putting it in an iframe.
 */
const HostDialog: FC<{ onClose: () => void }> = ({ onClose }): ReactNode => (
  <div className={styles.dialogScrim}>
    <div className={styles.dialog}>
      <h2>A dialog belonging to the host</h2>
      <p>This should cover the calls completely.</p>
      <button onClick={onClose}>Close</button>
    </div>
  </div>
);

/**
 * Stands in for a host application embedding Element Call: it owns the Matrix
 * clients, the page and the space each call is given, and reaches Element Call
 * only through the component's public interface.
 *
 * Two calls at once, from two devices of the same account, so that a real call
 * happens between them and anything Element Call keeps once per process rather
 * than once per call shows itself.
 */
export const Harness: FC = (): ReactNode => {
  const [credentials, setCredentials] = useState(loadCredentials);
  const [state, setState] = useState<State>({ phase: "credentials" });
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const log = useCallback((pane: string, message: string): void => {
    setEntries((entries) =>
      [
        ...entries,
        { pane, message, at: new Date().toLocaleTimeString() },
      ].slice(-100),
    );
  }, []);

  const start = useCallback(
    (event: FormEvent): void => {
      event.preventDefault();
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
      const { homeserver, username, password, room } = credentials;

      const progress = (message: string): void =>
        setState({ phase: "starting", progress: message });
      progress("Starting");

      void (async (): Promise<void> => {
        try {
          // One at a time: two logins at once from the same account is the
          // shape of request homeservers rate limit
          const sessions: Session[] = [];
          for (const label of ["Call A", "Call B"])
            sessions.push({
              label,
              client: await createSession(
                homeserver,
                username,
                password,
                (message) => progress(`${label}: ${message}`),
              ),
            });

          progress("Joining the room");
          let roomId = room;
          for (const { client } of sessions)
            roomId = await joinRoom(client, roomId);

          setState({ phase: "started", roomId, sessions });
        } catch (e) {
          logger.error("The harness could not start", e);
          setState({ phase: "failed", error: `${e}` });
        }
      })();
    },
    [credentials],
  );

  const field = (
    name: keyof Credentials,
    label: string,
    type = "text",
  ): ReactNode => (
    <label className={styles.field}>
      {label}
      <input
        type={type}
        value={credentials[name]}
        onChange={(e): void =>
          setCredentials((c) => ({ ...c, [name]: e.target.value }))
        }
      />
    </label>
  );

  if (state.phase !== "started")
    return (
      <form className={styles.credentials} onSubmit={start}>
        <h1>Element Call component harness</h1>
        <p>
          Signs in twice and shows Element Call embedded twice, in a page that
          is not Element Call&apos;s own.
        </p>
        {field("homeserver", "Homeserver")}
        {field("username", "Username")}
        {field("password", "Password", "password")}
        {field("room", "Room ID or alias")}
        <button type="submit" disabled={state.phase === "starting"}>
          Start
        </button>
        {state.phase === "starting" && <p>{state.progress}</p>}
        {state.phase === "failed" && (
          <p className={styles.error}>{state.error}</p>
        )}
      </form>
    );

  return (
    <div className={styles.harness}>
      <header className={styles.header}>
        <h1>Element Call component harness</h1>
        <code>{state.roomId}</code>
        <button onClick={(): void => setDialogOpen(true)}>
          Open a host dialog
        </button>
      </header>
      <div className={styles.middle}>
        <HostChrome />
        <main className={styles.panes}>
          {state.sessions.map((session) => (
            <Pane
              key={session.label}
              session={session}
              roomId={state.roomId}
              log={log}
            />
          ))}
        </main>
      </div>
      <section className={styles.log} data-testid="bridge-log">
        <h2>Host bridge</h2>
        <ol>
          {entries.map((entry, i) => (
            <li key={i}>
              <code>{entry.at}</code> <strong>{entry.pane}</strong>{" "}
              {entry.message}
            </li>
          ))}
        </ol>
      </section>
      {dialogOpen && <HostDialog onClose={(): void => setDialogOpen(false)} />}
    </div>
  );
};
