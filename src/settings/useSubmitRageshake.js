import { useCallback, useContext } from "react";
import * as rageshake from "matrix-react-sdk/src/rageshake/rageshake";
import pako from "pako";
import { useClient } from "../ClientContext";
import { InspectorContext } from "../room/GroupCallInspector";

export function useSubmitRageshake() {
  const { client } = useClient();
  const [{ json, svg }] = useContext(InspectorContext);

  const submitRageshake = useCallback(
    async (opts) => {
      let userAgent = "UNKNOWN";
      if (window.navigator && window.navigator.userAgent) {
        userAgent = window.navigator.userAgent;
      }

      let touchInput = "UNKNOWN";
      try {
        // MDN claims broad support across browsers
        touchInput = String(window.matchMedia("(pointer: coarse)").matches);
      } catch (e) {}

      const body = new FormData();
      body.append(
        "text",
        opts.description || "User did not supply any additional text."
      );
      body.append("app", "matrix-video-chat");
      body.append("version", "dev");
      body.append("user_agent", userAgent);
      body.append("installed_pwa", false);
      body.append("touch_input", touchInput);

      if (client) {
        body.append("user_id", client.credentials.userId);
        body.append("device_id", client.deviceId);

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
          const estimate = await navigator.storage.estimate();
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

      const logs = await rageshake.getLogsForReport();

      for (const entry of logs) {
        // encode as UTF-8
        let buf = new TextEncoder().encode(entry.lines);

        // compress
        buf = pako.gzip(buf);

        body.append("compressed-log", new Blob([buf]), entry.id);
      }

      if (json) {
        body.append(
          "file",
          new Blob([JSON.stringify(json)], { type: "text/plain" }),
          "groupcall.txt"
        );
      }

      await fetch(
        import.meta.env.VITE_RAGESHAKE_SUBMIT_URL ||
          "https://element.io/bugreports/submit",
        {
          method: "POST",
          body,
        }
      );
    },
    [client]
  );

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
  });

  return { submitRageshake, downloadDebugLog };
}
