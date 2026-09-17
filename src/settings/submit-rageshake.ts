/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ComponentProps, useCallback, useEffect, useState } from "react";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  ClientEvent,
  type MatrixClient,
  type MatrixEvent,
} from "matrix-js-sdk";
import { type CryptoApi } from "matrix-js-sdk/lib/crypto-api";

import { getLogsForReport } from "./rageshake";
import { useClient } from "../ClientContext";
import { Config } from "../config/Config";
import { type RageshakeRequestModal } from "../room/RageshakeRequestModal";
import { getUrlParams } from "../UrlParams";
import { deepCompare } from "matrix-js-sdk/lib/utils";
import { advancedCamera as advancedCameraSetting } from "./settings";
import { advancedScreenShare as advancedScreenShareSetting } from "./settings";
import { DEFAULT_CONFIG } from "../config/ConfigOptions";
import { effectiveCallViewModelImplementation } from "../state/rtc/implementation";
import { useOptionalMatrixDrivers } from "../driver/MatrixDriverContext";
const gzip = async (text: string): Promise<Blob> => {
  // pako is relatively large (200KB), so we only import it when needed
  const { gzip: pakoGzip } = await import("pako");

  // encode as UTF-8
  const buf = new TextEncoder().encode(text);
  // compress
  return new Blob([pakoGzip(buf)]);
};

/**
 * Collects crypto related information.
 */
async function collectCryptoInfo(
  cryptoApi: CryptoApi,
  body: FormData,
): Promise<void> {
  body.append("crypto_version", cryptoApi.getVersion());

  const ownDeviceKeys = await cryptoApi.getOwnDeviceKeys();
  const keys = [
    `curve25519:${ownDeviceKeys.curve25519}`,
    `ed25519:${ownDeviceKeys.ed25519}`,
  ];

  body.append("device_keys", keys.join(", "));

  // add cross-signing status information
  const crossSigningStatus = await cryptoApi.getCrossSigningStatus();

  body.append(
    "cross_signing_ready",
    String(await cryptoApi.isCrossSigningReady()),
  );
  body.append(
    "cross_signing_key",
    (await cryptoApi.getCrossSigningKeyId()) ?? "n/a",
  );
  body.append(
    "cross_signing_privkey_in_secret_storage",
    String(crossSigningStatus.privateKeysInSecretStorage),
  );

  body.append(
    "cross_signing_master_privkey_cached",
    String(crossSigningStatus.privateKeysCachedLocally.masterKey),
  );
  body.append(
    "cross_signing_self_signing_privkey_cached",
    String(crossSigningStatus.privateKeysCachedLocally.selfSigningKey),
  );
  body.append(
    "cross_signing_user_signing_privkey_cached",
    String(crossSigningStatus.privateKeysCachedLocally.userSigningKey),
  );
}

/**
 * Collects information about secret storage and backup.
 */
async function collectRecoveryInfo(
  client: MatrixClient,
  cryptoApi: CryptoApi,
  body: FormData,
): Promise<void> {
  const secretStorage = client.secretStorage;
  body.append(
    "secret_storage_ready",
    String(await cryptoApi.isSecretStorageReady()),
  );
  body.append(
    "secret_storage_key_in_account",
    String(await secretStorage.hasKey()),
  );

  body.append(
    "session_backup_key_in_secret_storage",
    String(!!(await client.isKeyBackupKeyStored())),
  );
  const sessionBackupKeyFromCache =
    await cryptoApi.getSessionBackupPrivateKey();
  body.append("session_backup_key_cached", String(!!sessionBackupKeyFromCache));
  body.append(
    "session_backup_key_well_formed",
    String(sessionBackupKeyFromCache instanceof Uint8Array),
  );
}

interface RageShakeSubmitOptions {
  sendLogs: boolean;
  rageshakeRequestId?: string;
  description?: string;
  roomId?: string;
  label?: string;
}

export function getRageshakeSubmitUrl(): string | undefined {
  if (import.meta.env.VITE_PACKAGE === "full") {
    // in full package we always use the one configured on the server
    return Config.get().rageshake?.submit_url;
  }

  if (import.meta.env.VITE_PACKAGE === "embedded") {
    // in embedded package we always use the one provided by the widget host
    return getUrlParams().rageshakeSubmitUrl ?? undefined;
  }

  return undefined;
}

export function useSubmitRageshake(
  injectedGetRageshakeSubmitUrl = getRageshakeSubmitUrl,
): {
  submitRageshake: (opts: RageShakeSubmitOptions) => Promise<void>;
  sending: boolean;
  sent: boolean;
  error?: Error;
  available: boolean;
} {
  const { client } = useClient();
  const drivers = useOptionalMatrixDrivers();

  const [{ sending, sent, error }, setState] = useState<{
    sending: boolean;
    sent: boolean;
    error?: Error;
  }>({
    sending: false,
    sent: false,
    error: undefined,
  });

  const submitRageshake = useCallback(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    async (opts) => {
      const submitUrl = injectedGetRageshakeSubmitUrl();
      if (!submitUrl) {
        throw new Error("No rageshake URL is configured");
      }

      if (sending) {
        return;
      }

      try {
        setState({ sending: true, sent: false, error: undefined });

        let userAgent = "UNKNOWN";
        if (window.navigator && window.navigator.userAgent) {
          userAgent = window.navigator.userAgent;
        }

        let touchInput = "UNKNOWN";
        try {
          // MDN claims broad support across browsers
          touchInput = String(window.matchMedia("(pointer: coarse)").matches);
        } catch (e) {
          logger.warn("Could not get coarse pointer for rageshake submit.", e);
        }

        let description = opts.rageshakeRequestId
          ? `Rageshake ${opts.rageshakeRequestId}`
          : "";
        if (opts.description) description += `: ${opts.description}`;

        const body = new FormData();
        body.append(
          "text",
          description ?? "User did not supply any additional text.",
        );
        body.append("app", "matrix-video-chat");
        body.append(
          "version",
          (import.meta.env.VITE_APP_VERSION as string) || "dev",
        );
        body.append("user_agent", userAgent);
        body.append("installed_pwa", "false");
        body.append("touch_input", touchInput);
        body.append("call_backend", "livekit");
        body.append(
          "call_view_model_implementation",
          effectiveCallViewModelImplementation(),
        );
        // What the host's drivers know, and the crate's own view of the
        // call when it carries it.
        if (drivers?.clientDriver.getDiagnostics) {
          try {
            for (const [key, value] of Object.entries(
              await drivers.clientDriver.getDiagnostics(),
            ))
              body.append(`driver_${key}`, value);
          } catch (e) {
            logger.warn("Could not collect the driver's diagnostics", e);
          }
        }
        const rtcParticipationManager =
          window.matrixRtc?.rtcParticipationManager;
        if (rtcParticipationManager)
          body.append(
            "matrix_rtc_snapshot",
            rtcParticipationManager.debugSnapshot(),
          );
        body.append("hostname", window.location.hostname);

        if (client) {
          const userId = client.getUserId()!;
          const user = client.getUser(userId);
          body.append("display_name", user?.displayName ?? "");
          body.append("user_id", client.credentials.userId ?? "");
          body.append("device_id", client.deviceId ?? "");

          if (opts.roomId) {
            body.append("room_id", opts.roomId);
          }

          const crypto = client.getCrypto();
          if (crypto) {
            await collectCryptoInfo(crypto, body);
            await collectRecoveryInfo(client, crypto, body);
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
              String(await navigator.storage.persisted()),
            );
          } catch (e) {
            logger.warn("coulr not get navigator peristed storage", e);
          }
        } else if (document.hasStorageAccess) {
          // Safari
          try {
            body.append(
              "storageManager_persisted",
              String(await document.hasStorageAccess()),
            );
          } catch (e) {
            logger.warn("could not get storage access", e);
          }
        }

        // Add custom media related information to the rageshake issue description.
        // Used to quickly identify issues due to untested configurations.
        if (
          !deepCompare(Config.get().media_quality, DEFAULT_CONFIG.media_quality)
        ) {
          body.append("custom_media_quality_in_config", "true");
        }
        if (advancedCameraSetting.getValue()) {
          body.append("devTools_advancedCameraSettings", "true");
        }
        if (advancedScreenShareSetting.getValue()) {
          body.append("devTools_advancedScreenShareSetting", "true");
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
                  String(estimate.usageDetails![k]),
                );
              });
            }
          } catch (e) {
            logger.warn("could not obatain storage estimate", e);
          }
        }

        if (opts.sendLogs) {
          const logs = await getLogsForReport();

          for (const entry of logs) {
            body.append("compressed-log", await gzip(entry.lines), entry.id);
          }
        }

        if (opts.rageshakeRequestId) {
          body.append(
            "group_call_rageshake_request_id",
            opts.rageshakeRequestId,
          );
        }

        const res = await fetch(submitUrl, {
          method: "POST",
          body,
        });

        if (res.status !== 200) {
          throw new Error(
            `Failed to submit feedback: receive HTTP ${res.status} ${res.statusText}`,
          );
        }

        setState({ sending: false, sent: true, error: undefined });
      } catch (error) {
        setState({ sending: false, sent: false, error: error as Error });
        logger.error(error);
      }
    },
    [client, drivers, sending, injectedGetRageshakeSubmitUrl],
  );

  return {
    submitRageshake,
    sending,
    sent,
    error,
    available: !!injectedGetRageshakeSubmitUrl(),
  };
}

export function useRageshakeRequest(): (
  roomId: string,
  rageshakeRequestId: string,
) => void {
  const { client } = useClient();
  const drivers = useOptionalMatrixDrivers();

  const sendRageshakeRequest = useCallback(
    (roomId: string, rageshakeRequestId: string) => {
      const content = { request_id: rageshakeRequestId };
      const sent: Promise<unknown> =
        drivers !== null
          ? drivers.clientDriver.sendRoomEvent(
              "org.matrix.rageshake_request",
              content,
            )
          : // @ts-expect-error - org.matrix.rageshake_request is not part of `keyof TimelineEvents` but it is okay to sent a custom event.
            client!.sendEvent(roomId, "org.matrix.rageshake_request", content);
      sent.catch((e: unknown) => {
        logger.error("Failed to send org.matrix.rageshake_request event", e);
      });
    },
    [client, drivers],
  );
  return sendRageshakeRequest;
}

export function useRageshakeRequestModal(
  roomId: string,
): ComponentProps<typeof RageshakeRequestModal> {
  const [open, setOpen] = useState(false);
  const onDismiss = useCallback(() => setOpen(false), [setOpen]);
  const { client } = useClient();
  const drivers = useOptionalMatrixDrivers();
  const [rageshakeRequestId, setRageshakeRequestId] = useState<string>();

  useEffect(() => {
    if (drivers !== null) {
      const { clientDriver } = drivers;
      return clientDriver.subscribeTimeline((event) => {
        if (
          event.type === "org.matrix.rageshake_request" &&
          event.sender !== clientDriver.userId
        ) {
          setRageshakeRequestId(event.content.request_id as string);
          setOpen(true);
        }
      });
    }
    if (!client) return;

    const onEvent = (event: MatrixEvent): void => {
      const type = event.getType();

      if (
        type === "org.matrix.rageshake_request" &&
        roomId === event.getRoomId() &&
        client.getUserId() !== event.getSender()
      ) {
        setRageshakeRequestId(event.getContent().request_id);
        setOpen(true);
      }
    };

    client.on(ClientEvent.Event, onEvent);

    return (): void => {
      client.removeListener(ClientEvent.Event, onEvent);
    };
  }, [setOpen, roomId, client, drivers]);

  return {
    rageshakeRequestId: rageshakeRequestId ?? "",
    roomId,
    open,
    onDismiss,
  };
}
