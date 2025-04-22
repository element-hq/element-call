/*
Copyright 2018-2024 New Vector Ltd.
Copyright 2017 OpenMarket Ltd

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// This module contains all the code needed to log the console, persist it to
// disk and submit bug reports. Rationale is as follows:
//  - Monkey-patching the console is preferable to having a log library because
//    we can catch logs by other libraries more easily, without having to all
//    depend on the same log framework / pass the logger around.
//  - We use IndexedDB to persists logs because it has generous disk space
//    limits compared to local storage. IndexedDB does not work in incognito
//    mode, in which case this module will not be able to write logs to disk.
//    However, the logs will still be stored in-memory, so can still be
//    submitted in a bug report should the user wish to: we can also store more
//    logs in-memory than in local storage, which does work in incognito mode.
//    We also need to handle the case where there are 2+ tabs. Each JS runtime
//    generates a random string which serves as the "ID" for that tab/session.
//    These IDs are stored along with the log lines.
//  - Bug reports are sent as a POST over HTTPS: it purposefully does not use
//    Matrix as bug reports may be made when Matrix is not responsive (which may
//    be the cause of the bug). We send the most recent N MB of UTF-8 log data,
//    starting with the most recent, which we know because the "ID"s are
//    actually timestamps. We then purge the remaining logs. We also do this
//    purge on startup to prevent logs from accumulating.

import EventEmitter from "events";
import { throttle } from "lodash-es";
import { type Logger, logger } from "matrix-js-sdk/lib/logger";
import { secureRandomString } from "matrix-js-sdk/lib/randomstring";
import { type LoggingMethod } from "loglevel";

import type loglevel from "loglevel";

// the length of log data we keep in indexeddb (and include in the reports)
const MAX_LOG_SIZE = 1024 * 1024 * 5; // 5 MB

// Shortest amount of time between flushes. We are just appending to an
// IndexedDB table so we don't expect flushing to be that expensive, but
// we can batch the writes a little.
const MAX_FLUSH_INTERVAL_MS = 2 * 1000;

// only descend this far into nested object trees
const DEPTH_LIMIT = 3;

enum ConsoleLoggerEvent {
  Log = "log",
}

// A class which monkey-patches the global console and stores log lines.

interface LogEntry {
  id: string;
  lines: string;
  index?: number;
}

class ConsoleLogger extends EventEmitter {
  private logs = "";

  public log = (
    level: LogLevel,
    ...args: (Error | DOMException | object | string | undefined)[]
  ): void => {
    // We don't know what locale the user may be running so use ISO strings
    const ts = new Date().toISOString();

    // Convert objects and errors to helpful things
    args = args.map((arg) => {
      if (arg instanceof DOMException) {
        return arg.message + ` (${arg.name} | ${arg.code})`;
      } else if (arg instanceof Error) {
        return arg.message + (arg.stack ? `\n${arg.stack}` : "");
      } else if (typeof arg === "object") {
        return JSON.stringify(arg, getCircularReplacer());
      } else {
        return arg;
      }
    });

    // Some browsers support string formatting which we're not doing here
    // so the lines are a little more ugly but easy to implement / quick to
    // run.
    // Example line:
    // 2017-01-18T11:23:53.214Z W Failed to set badge count
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    let line = `${ts} ${level} ${args.join(" ")}\n`;
    // Do some cleanup
    line = line.replace(/token=[a-zA-Z0-9-]+/gm, "token=xxxxx");
    // Using + really is the quickest way in JS
    // http://jsperf.com/concat-vs-plus-vs-join
    this.logs += line;

    this.emit(ConsoleLoggerEvent.Log);
  };

  /**
   * Returns the log lines to flush to disk and empties the internal log buffer
   * @return {string} \n delimited log lines
   */
  public popLogs(): string {
    const logsToFlush = this.logs;
    this.logs = "";
    return logsToFlush;
  }

  /**
   * Returns lines currently in the log buffer without removing them
   * @return {string} \n delimited log lines
   */
  public peekLogs(): string {
    return this.logs;
  }
}

// A class which stores log lines in an IndexedDB instance.
class IndexedDBLogStore {
  private index = 0;
  private db?: IDBDatabase;
  private flushPromise?: Promise<void>;
  private flushAgainPromise?: Promise<void>;
  private id: string;

  public constructor(
    private indexedDB: IDBFactory,
    private loggerInstance: ConsoleLogger,
  ) {
    this.id = "instance-" + secureRandomString(16);

    loggerInstance.on(ConsoleLoggerEvent.Log, this.onLoggerLog);
    window.addEventListener("beforeunload", () => {
      this.flush().catch((e) =>
        logger.error("Failed to flush logs before unload", e),
      );
    });
  }

  /**
   * @return {Promise} Resolves when the store is ready.
   */
  public async connect(): Promise<void> {
    const req = this.indexedDB.open("logs");
    return new Promise((resolve, reject) => {
      req.onsuccess = (): void => {
        this.db = req.result;

        resolve();
      };

      req.onerror = (): void => {
        const err = "Failed to open log database: " + req?.error?.name;
        logger.error(err);
        reject(new Error(err));
      };

      // First time: Setup the object store
      req.onupgradeneeded = (): void => {
        const db = req.result;
        // This is the log entries themselves. Each entry is a chunk of
        // logs (ie multiple lines). 'id' is the instance ID (so logs with
        // the same instance ID are all from the same session) and 'index'
        // is a sequence number for the chunk. The log lines live in the
        // 'lines' key, which is a chunk of many newline-separated log lines.
        const logObjStore = db.createObjectStore("logs", {
          keyPath: ["id", "index"],
        });
        // Keys in the database look like: [ "instance-148938490", 0 ]
        // (The instance ID plus the ID of each log chunk).
        // Later on we need to query everything based on an instance id.
        // In order to do this, we need to set up indexes "id".
        logObjStore.createIndex("id", "id", { unique: false });

        logObjStore.add(
          this.generateLogEntry(new Date() + " ::: Log database was created."),
        );

        // This records the last time each instance ID generated a log message, such
        // that the logs from each session can be collated in the order they last logged
        // something.
        const lastModifiedStore = db.createObjectStore("logslastmod", {
          keyPath: "id",
        });
        lastModifiedStore.add(this.generateLastModifiedTime());
      };
    });
  }

  private onLoggerLog = (): void => {
    if (!this.db) return;

    this.throttledFlush();
  };

  // Throttled function to flush logs. We use throttle rather
  // than debounce as we want logs to be written regularly, otherwise
  // if there's a constant stream of logging, we'd never write anything.
  private throttledFlush = throttle(() => this.flush, MAX_FLUSH_INTERVAL_MS, {
    leading: false,
    trailing: true,
  });

  /**
   * Flush logs to disk.
   *
   * There are guards to protect against race conditions in order to ensure
   * that all previous flushes have completed before the most recent flush.
   * Consider without guards:
   *  - A calls flush() periodically.
   *  - B calls flush() and wants to send logs immediately afterwards.
   *  - If B doesn't wait for A's flush to complete, B will be missing the
   *    contents of A's flush.
   * To protect against this, we set 'flushPromise' when a flush is ongoing.
   * Subsequent calls to flush() during this period will chain another flush,
   * then keep returning that same chained flush.
   *
   * This guarantees that we will always eventually do a flush when flush() is
   * called.
   *
   * @return {Promise} Resolved when the logs have been flushed.
   */
  public flush = async (): Promise<void> => {
    // check if a flush() operation is ongoing
    if (this.flushPromise) {
      if (this.flushAgainPromise) {
        // this is the 3rd+ time we've called flush() : return the same promise.
        return this.flushAgainPromise;
      }
      // queue up a flush to occur immediately after the pending one completes.
      this.flushAgainPromise = this.flushPromise.then(this.flush).then(() => {
        this.flushAgainPromise = undefined;
      });
      return this.flushAgainPromise;
    }
    // there is no flush promise or there was but it has finished, so do
    // a brand new one, destroying the chain which may have been built up.
    this.flushPromise = new Promise<void>((resolve, reject) => {
      if (!this.db) {
        // not connected yet or user rejected access for us to r/w to the db.
        reject(new Error("No connected database"));
        return;
      }
      const lines = this.loggerInstance.popLogs();
      if (lines.length === 0) {
        resolve();
        return;
      }
      const txn = this.db.transaction(["logs", "logslastmod"], "readwrite");
      const objStore = txn.objectStore("logs");
      txn.oncomplete = (): void => {
        resolve();
      };
      txn.onerror = (event): void => {
        logger.error("Failed to flush logs : ", event);
        reject(new Error("Failed to write logs: " + txn?.error?.message));
      };
      objStore.add(this.generateLogEntry(lines));
      const lastModStore = txn.objectStore("logslastmod");
      lastModStore.put(this.generateLastModifiedTime());
    }).then(() => {
      this.flushPromise = undefined;
    });
    return this.flushPromise;
  };

  /**
   * Consume the most recent logs and return them. Older logs which are not
   * returned are deleted at the same time, so this can be called at startup
   * to do house-keeping to keep the logs from growing too large.
   *
   * @return {Promise<Object[]>} Resolves to an array of objects. The array is
   * sorted in time (oldest first) based on when the log file was created (the
   * log ID). The objects have said log ID in an "id" field and "lines" which
   * is a big string with all the new-line delimited logs.
   */
  public async consume(): Promise<LogEntry[]> {
    const db = this.db;
    if (!db) {
      return Promise.reject(new Error("No connected database"));
    }

    // Returns: a string representing the concatenated logs for this ID.
    // Stops adding log fragments when the size exceeds maxSize
    async function fetchLogs(id: string, maxSize: number): Promise<string> {
      const objectStore = db!
        .transaction("logs", "readonly")
        .objectStore("logs");

      return new Promise((resolve, reject) => {
        const query = objectStore
          .index("id")
          .openCursor(IDBKeyRange.only(id), "prev");
        let lines = "";
        query.onerror = (): void => {
          reject(new Error("Query failed: " + query?.error?.message));
        };
        query.onsuccess = (): void => {
          const cursor = query.result;
          if (!cursor) {
            resolve(lines);
            return; // end of results
          }
          lines = cursor.value.lines + lines;
          if (lines.length >= maxSize) {
            resolve(lines);
          } else {
            cursor.continue();
          }
        };
      });
    }

    // Returns: A sorted array of log IDs. (newest first)
    async function fetchLogIds(): Promise<string[]> {
      // To gather all the log IDs, query for all records in logslastmod.
      const o = db!
        .transaction("logslastmod", "readonly")
        .objectStore("logslastmod");
      return selectQuery<{ ts: number; id: string }>(o, undefined, (cursor) => {
        return {
          id: cursor.value.id,
          ts: cursor.value.ts,
        };
      }).then((res) => {
        // Sort IDs by timestamp (newest first)
        return res
          .sort((a, b) => {
            return b.ts - a.ts;
          })
          .map((a) => a.id);
      });
    }

    async function deleteLogs(id: number): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const txn = db!.transaction(["logs", "logslastmod"], "readwrite");
        const o = txn.objectStore("logs");
        // only load the key path, not the data which may be huge
        const query = o.index("id").openKeyCursor(IDBKeyRange.only(id));
        query.onsuccess = (): void => {
          const cursor = query.result;
          if (!cursor) {
            return;
          }
          o.delete(cursor.primaryKey);
          cursor.continue();
        };
        txn.oncomplete = (): void => {
          resolve();
        };
        txn.onerror = (): void => {
          reject(
            new Error(
              "Failed to delete logs for " + `'${id}' : ${txn?.error?.message}`,
            ),
          );
        };
        // delete last modified entries
        const lastModStore = txn.objectStore("logslastmod");
        lastModStore.delete(id);
      });
    }

    const allLogIds = await fetchLogIds();
    let removeLogIds: number[] = [];
    const logs: LogEntry[] = [];
    let size = 0;
    for (let i = 0; i < allLogIds.length; i++) {
      const lines = await fetchLogs(allLogIds[i], MAX_LOG_SIZE - size);

      // always add the log file: fetchLogs will truncate once the maxSize we give it is
      // exceeded, so we'll go over the max but only by one fragment's worth.
      logs.push({
        lines: lines,
        id: allLogIds[i],
      });
      size += lines.length;

      // If fetchLogs truncated we'll now be at or over the size limit,
      // in which case we should stop and remove the rest of the log files.
      if (size >= MAX_LOG_SIZE) {
        // the remaining log IDs should be removed. If we go out of
        // bounds this is just []
        removeLogIds = allLogIds.slice(i + 1).map((id) => parseInt(id, 10));
        break;
      }
    }
    if (removeLogIds.length > 0) {
      logger.log("Removing logs: ", removeLogIds);
      // Don't await this because it's non-fatal if we can't clean up
      // logs.
      Promise.all(removeLogIds.map(async (id) => deleteLogs(id))).then(
        () => {
          logger.log(`Removed ${removeLogIds.length} old logs.`);
        },
        (err) => {
          logger.error(err);
        },
      );
    }
    return logs;
  }

  private generateLogEntry(lines: string): LogEntry {
    return {
      id: this.id,
      lines: lines,
      index: this.index++,
    };
  }

  private generateLastModifiedTime(): { id: string; ts: number } {
    return {
      id: this.id,
      ts: Date.now(),
    };
  }
}

/**
 * Helper method to collect results from a Cursor and promiseify it.
 * @param {ObjectStore|Index} store The store to perform openCursor on.
 * @param {IDBKeyRange=} keyRange Optional key range to apply on the cursor.
 * @param {Function} resultMapper A function which is repeatedly called with a
 * Cursor.
 * Return the data you want to keep.
 * @return {Promise<T[]>} Resolves to an array of whatever you returned from
 * resultMapper.
 */
async function selectQuery<T>(
  store: IDBObjectStore,
  keyRange: IDBKeyRange | undefined,
  resultMapper: (cursor: IDBCursorWithValue) => T,
): Promise<T[]> {
  const query = store.openCursor(keyRange);
  return new Promise((resolve, reject) => {
    const results: T[] = [];
    query.onerror = (): void => {
      reject(new Error("Query failed: " + query?.error?.message));
    };
    // collect results
    query.onsuccess = (): void => {
      const cursor = query.result;
      if (!cursor) {
        resolve(results);
        return; // end of results
      }
      results.push(resultMapper(cursor));
      cursor.continue();
    };
  });
}
declare global {
  // eslint-disable-next-line no-var, camelcase
  var mx_rage_store: IndexedDBLogStore;
  // eslint-disable-next-line no-var, camelcase
  var mx_rage_logger: ConsoleLogger;
  // eslint-disable-next-line no-var, camelcase
  var mx_rage_initStoragePromise: Promise<void> | undefined;
}

/**
 * Configure rage shaking support for sending bug reports.
 * Modifies globals.
 * @param {boolean} setUpPersistence When true (default), the persistence will
 * be set up immediately for the logs.
 * @return {Promise} Resolves when set up.
 */
export async function init(): Promise<void> {
  global.mx_rage_logger = new ConsoleLogger();

  // configure loglevel based loggers:
  setLogExtension(logger, global.mx_rage_logger.log);

  // intercept console logging so that we can get matrix_sdk logs:
  // this is nasty, but no logging hooks are provided
  [
    "trace" as const,
    "debug" as const,
    "info" as const,
    "warn" as const,
    "error" as const,
  ].forEach((level) => {
    const originalMethod = window.console[level];
    if (!originalMethod) return;
    const prefix = `${level.toUpperCase()} matrix_sdk`;
    window.console[level] = (...args): void => {
      originalMethod(...args);
      // args for calls from the matrix-sdk-crypto-wasm look like:
      // ["DEBUG matrix_sdk_indexeddb::crypto_store: IndexedDbCryptoStore: opening main store matrix-js-sdk::matrix-sdk-crypto\n    at /home/runner/.cargo/git/checkouts/matrix-rust-sdk-1f4927f82a3d27bb/07aa6d7/crates/matrix-sdk-indexeddb/src/crypto_store/mod.rs:267"]
      if (typeof args[0] === "string" && args[0].startsWith(prefix)) {
        // we pass all the args on to the logger in case there are more sent in future
        global.mx_rage_logger.log(LogLevel[level], "matrix_sdk", ...args);
      }
    };
  });

  return tryInitStorage();
}

/**
 * Try to start up the rageshake storage for logs. If not possible (client unsupported)
 * then this no-ops.
 * @return {Promise} Resolves when complete.
 */
async function tryInitStorage(): Promise<void> {
  if (global.mx_rage_initStoragePromise) {
    return global.mx_rage_initStoragePromise;
  }

  logger.log("Configuring rageshake persistence...");

  // just *accessing* indexedDB throws an exception in firefox with
  // indexeddb disabled.
  let indexedDB;
  try {
    indexedDB = window.indexedDB;
  } catch (e) {
    logger.warn("Could not get indexDB from window.", e);
  }

  if (indexedDB) {
    global.mx_rage_store = new IndexedDBLogStore(
      indexedDB,
      global.mx_rage_logger,
    );
    global.mx_rage_initStoragePromise = global.mx_rage_store.connect();
    return global.mx_rage_initStoragePromise;
  }
  global.mx_rage_initStoragePromise = Promise.resolve();
  return global.mx_rage_initStoragePromise;
}

/**
 * Get a recent snapshot of the logs, ready for attaching to a bug report
 *
 * @return {LogEntry[]}  list of log data
 */
export async function getLogsForReport(): Promise<LogEntry[]> {
  if (!global.mx_rage_logger) {
    throw new Error("No console logger, did you forget to call init()?");
  }
  // If in incognito mode, store is null, but we still want bug report
  // sending to work going off the in-memory console logs.
  if (global.mx_rage_store) {
    // flush most recent logs
    await global.mx_rage_store.flush();
    return global.mx_rage_store.consume();
  } else {
    return [
      {
        lines: global.mx_rage_logger.peekLogs(),
        id: "-",
      },
    ];
  }
}

type StringifyReplacer = (
  this: unknown,
  key: string,
  value: unknown,
) => unknown;

// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#circular_references
// Injects `<$ cycle-trimmed $>` wherever it cuts a cyclical object relationship
const getCircularReplacer = (): StringifyReplacer => {
  const seen = new WeakSet();
  const depthMap = new WeakMap<object, number>();
  return function (this: unknown, key: string, value: unknown): unknown {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "<$ cycle-trimmed $>";
      }
      seen.add(value);

      let depth = 0;
      if (this) {
        depth = depthMap.get(this) ?? 0;
      }
      depthMap.set(value, depth + 1);

      if (depth > DEPTH_LIMIT) return "<$ object-pruned $>";
    }
    return value;
  };
};

enum LogLevel {
  trace = 0,
  debug = 1,
  info = 2,
  warn = 3,
  error = 4,
  silent = 5,
}

type LogExtensionFunc = (
  level: LogLevel,
  ...rest: (Error | DOMException | object | string)[]
) => void;
type LogLevelString = keyof typeof LogLevel;

/**
 * This method borrowed from livekit (who also use loglevel and in turn essentially
 * took loglevel's example honouring log levels). Adds a loglevel logging extension
 * in the recommended way.
 */
function setLogExtension(
  _loggerToExtend: Logger,
  extension: LogExtensionFunc,
): void {
  const loggerToExtend = _loggerToExtend as unknown as loglevel.Logger;
  const originalFactory = loggerToExtend.methodFactory;

  loggerToExtend.methodFactory = function (
    methodName,
    configLevel,
    loggerName,
  ): LoggingMethod {
    const rawMethod = originalFactory(methodName, configLevel, loggerName);

    const logLevel = LogLevel[methodName as LogLevelString];
    const needLog = logLevel >= configLevel && logLevel < LogLevel.silent;

    return (...args) => {
      // we don't send the logger name to the raw method as some of them are already outputting the prefix
      rawMethod.apply(this, args);
      if (needLog) {
        // we prefix the logger name to the extension
        // this makes sure that the rageshake contains the logger name
        extension(logLevel, loggerName?.toString(), ...args);
      }
    };
  };
  loggerToExtend.setLevel(loggerToExtend.getLevel()); // Be sure to call setLevel method in order to apply plugin
}
