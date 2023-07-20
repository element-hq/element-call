/*
Copyright 2022 New Vector Ltd

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

import { useCallback, useContext, useEffect, useState } from "react";
import pako from "pako";
import { MatrixEvent } from "matrix-js-sdk/src/models/event";
import { OverlayTriggerState } from "@react-stately/overlays";
import { MatrixClient, ClientEvent } from "matrix-js-sdk/src/client";

import { getLogsForReport } from "./rageshake";
import { useClient } from "../ClientContext";
import { InspectorContext } from "../room/GroupCallInspector";
import { useModalTriggerState } from "../Modal";
import { Config } from "../config/Config";
import { ElementCallOpenTelemetry } from "../otel/otel";

const gzip = (text: string): Blob => {
  // encode as UTF-8
  const buf = new TextEncoder().encode(text);
  // compress
  return new Blob([pako.gzip(buf)]);
};

interface RageShakeSubmitOptions {
  sendLogs: boolean;
  rageshakeRequestId?: string;
  description?: string;
  roomId?: string;
  label?: string;
}

export function useSubmitRageshake(): {
  submitRageshake: (opts: RageShakeSubmitOptions) => Promise<void>;
  sending: boolean;
  sent: boolean;
  error: Error;
} {
  const client: MatrixClient = useClient().client;
  // The value of the context is the whole tuple returned from setState,
  // so we just want the current state.
  const [inspectorState] = useContext(InspectorContext);

  const [{ sending, sent, error }, setState] = useState({
    sending: false,
    sent: false,
    error: null,
  });

  const submitRageshake = useCallback(
    async (opts) => {
      if (!Config.get().rageshake?.submit_url) {
        throw new Error("No rageshake URL is configured");
      }

      if (sending) {
        return;
      }

      try {
        setState({ sending: true, sent: false, error: null });

        let userAgent = "UNKNOWN";
        if (window.navigator && window.navigator.userAgent) {
          userAgent = window.navigator.userAgent;
        }

        let touchInput = "UNKNOWN";
        try {
          // MDN claims broad support across browsers
          touchInput = String(window.matchMedia("(pointer: coarse)").matches);
        } catch (e) {}

        let description = opts.rageshakeRequestId
          ? `Rageshake ${opts.rageshakeRequestId}`
          : "";
        if (opts.description) description += `: ${opts.description}`;

        const body = new FormData();
        body.append(
          "text",
          description ?? "User did not supply any additional text."
        );
        body.append("app", "matrix-video-chat");
        body.append(
          "version",
          (import.meta.env.VITE_APP_VERSION as string) || "dev"
        );
        body.append("user_agent", userAgent);
        body.append("installed_pwa", "false");
        body.append("touch_input", touchInput);
        body.append("call_backend", "full-mesh");

        if (client) {
          const userId = client.getUserId();
          const user = client.getUser(userId);
          body.append("display_name", user?.displayName);
          body.append("user_id", client.credentials.userId);
          body.append("device_id", client.deviceId);

          if (opts.roomId) {
            body.append("room_id", opts.roomId);
          }

          if (client.isCryptoEnabled()) {
            const keys = [`ed25519:${client.getDeviceEd25519Key()}`];
            if (client.getDeviceCurve25519Key) {
              keys.push(`curve25519:${client.getDeviceCurve25519Key()}`);
            }
            body.append("device_keys", keys.join(", "));
            body.append("cross_signing_key", client.getCrossSigningId());

            // add cross-signing status information
            const crossSigning = client.crypto.crossSigningInfo;
            const secretStorage = client.crypto.secretStorage;

            body.append(
              "cross_signing_ready",
              String(await client.isCrossSigningReady())
            );
            body.append(
              "cross_signing_supported_by_hs",
              String(
                await client.doesServerSupportUnstableFeature(
                  "org.matrix.e2e_cross_signing"
                )
              )
            );
            body.append("cross_signing_key", crossSigning.getId());
            body.append(
              "cross_signing_privkey_in_secret_storage",
              String(
                !!(await crossSigning.isStoredInSecretStorage(secretStorage))
              )
            );

            const pkCache = client.getCrossSigningCacheCallbacks();
            body.append(
              "cross_signing_master_privkey_cached",
              String(
                !!(pkCache && (await pkCache.getCrossSigningKeyCache("master")))
              )
            );
            body.append(
              "cross_signing_self_signing_privkey_cached",
              String(
                !!(
                  pkCache &&
                  (await pkCache.getCrossSigningKeyCache("self_signing"))
                )
              )
            );
            body.append(
              "cross_signing_user_signing_privkey_cached",
              String(
                !!(
                  pkCache &&
                  (await pkCache.getCrossSigningKeyCache("user_signing"))
                )
              )
            );

            body.append(
              "secret_storage_ready",
              String(await client.isSecretStorageReady())
            );
            body.append(
              "secret_storage_key_in_account",
              String(!!(await secretStorage.hasKey()))
            );

            body.append(
              "session_backup_key_in_secret_storage",
              String(!!(await client.isKeyBackupKeyStored()))
            );
            const sessionBackupKeyFromCache =
              await client.crypto.getSessionBackupPrivateKey();
            body.append(
              "session_backup_key_cached",
              String(!!sessionBackupKeyFromCache)
            );
            body.append(
              "session_backup_key_well_formed",
              String(sessionBackupKeyFromCache instanceof Uint8Array)
            );
          }
        }

        if (opts.label) {
          body.append("label", opts.label);
        }

        // add storage persistence/quota information
        if (navigator.storage && navigator.storage.persisted) {
          try {
            body.append(
              "storageManager_persisted",
              String(await navigator.storage.persisted())
            );
          } catch (e) {}
        } else if (document.hasStorageAccess) {
          // Safari
          try {
            body.append(
              "storageManager_persisted",
              String(await document.hasStorageAccess())
            );
          } catch (e) {}
        }

        if (navigator.storage && navigator.storage.estimate) {
          try {
            const estimate: {
              quota?: number;
              usage?: number;
              usageDetails?: { [x: string]: unknown };
            } = await navigator.storage.estimate();
            body.append("storageManager_quota", String(estimate.quota));
            body.append("storageManager_usage", String(estimate.usage));
            if (estimate.usageDetails) {
              Object.keys(estimate.usageDetails).forEach((k) => {
                body.append(
                  `storageManager_usage_${k}`,
                  String(estimate.usageDetails[k])
                );
              });
            }
          } catch (e) {}
        }

        if (opts.sendLogs) {
          const logs = await getLogsForReport();

          for (const entry of logs) {
            body.append("compressed-log", gzip(entry.lines), entry.id);
          }

          body.append(
            "file",
            gzip(ElementCallOpenTelemetry.instance.rageshakeProcessor!.dump()),
            "traces.json.gz"
          );

          if (inspectorState) {
            body.append(
              "file",
              new Blob([JSON.stringify(inspectorState)], {
                type: "text/plain",
              }),
              "groupcall.txt"
            );
          }
        }

        if (opts.rageshakeRequestId) {
          body.append(
            "group_call_rageshake_request_id",
            opts.rageshakeRequestId
          );
        }

        await fetch(Config.get().rageshake?.submit_url, {
          method: "POST",
          body,
        });

        setState({ sending: false, sent: true, error: null });
      } catch (error) {
        setState({ sending: false, sent: false, error });
        console.error(error);
      }
    },
    [client, inspectorState, sending]
  );

  return {
    submitRageshake,
    sending,
    sent,
    error,
  };
}

export function useDownloadDebugLog(): () => void {
  const json = useContext(InspectorContext);

  const downloadDebugLog = useCallback(() => {
    const blob = new Blob([JSON.stringify(json)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = "groupcall.json";
    el.style.display = "none";
    document.body.appendChild(el);
    el.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      el.parentNode.removeChild(el);
    }, 0);
  }, [json]);

  return downloadDebugLog;
}

export function useRageshakeRequest(): (
  roomId: string,
  rageshakeRequestId: string
) => void {
  const { client } = useClient();

  const sendRageshakeRequest = useCallback(
    (roomId, rageshakeRequestId) => {
      client.sendEvent(roomId, "org.matrix.rageshake_request", {
        request_id: rageshakeRequestId,
      });
    },
    [client]
  );

  return sendRageshakeRequest;
}
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}
interface ModalPropsWithId extends ModalProps {
  rageshakeRequestId: string;
}

export function useRageshakeRequestModal(roomId: string): {
  modalState: OverlayTriggerState;
  modalProps: ModalPropsWithId;
} {
  const { modalState, modalProps } = useModalTriggerState() as {
    modalState: OverlayTriggerState;
    modalProps: ModalProps;
  };
  const client: MatrixClient = useClient().client;
  const [rageshakeRequestId, setRageshakeRequestId] = useState<string>();

  useEffect(() => {
    const onEvent = (event: MatrixEvent) => {
      const type = event.getType();

      if (
        type === "org.matrix.rageshake_request" &&
        roomId === event.getRoomId() &&
        client.getUserId() !== event.getSender()
      ) {
        setRageshakeRequestId(event.getContent().request_id);
        modalState.open();
      }
    };

    client.on(ClientEvent.Event, onEvent);

    return () => {
      client.removeListener(ClientEvent.Event, onEvent);
    };
  }, [modalState.open, roomId, client, modalState]);

  return { modalState, modalProps: { ...modalProps, rageshakeRequestId } };
}
