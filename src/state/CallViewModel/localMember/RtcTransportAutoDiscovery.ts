/*
Copyright 2026 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import {
  isLivekitTransportConfig,
  type LivekitTransportConfig,
} from "matrix-js-sdk/lib/matrixrtc";
import {
  type IClientWellKnown,
  type MatrixClient,
  MatrixError,
} from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";

import type { ResolvedConfigOptions } from "../../../config/ConfigOptions.ts";
import { doNetworkOperationWithRetry } from "../../../utils/matrix.ts";

type TransportDiscoveryClient = Pick<
  MatrixClient,
  "getDomain" | "_unstable_getRTCTransports" | "getAccessToken"
>;

export interface RtcTransportAutoDiscoveryProps {
  client: TransportDiscoveryClient;
  resolvedConfig: ResolvedConfigOptions;
  /**
   * Whether client `.well-known` lookups against the homeserver's `server_name`
   * are allowed. When false, the legacy MatrixRTC foci `.well-known` fallback is
   * skipped entirely and only the backend endpoint and app config are used.
   */
  enableClientWellKnownLookups: boolean;
  wellKnownFetcher: (domain: string) => Promise<IClientWellKnown>;
  logger: Logger;
}

/**
 * The outcome of querying the backend `/rtc/transports` endpoint.
 */
interface BackendTransportResult {
  /** The livekit transport found via the backend endpoint, if any. */
  transport: LivekitTransportConfig | null;
  /**
   * Whether the caller may fall back to the legacy `.well-known` lookup. True
   * only when the backend endpoint is unavailable, i.e. it was not attempted
   * (widget mode) or the homeserver does not implement it (404 M_UNRECOGNIZED).
   * False when the endpoint answered authoritatively (a response without a
   * livekit transport) or failed with any other error.
   */
  mayFallBackToWellKnown: boolean;
}

export class RtcTransportAutoDiscovery {
  private readonly client: TransportDiscoveryClient;
  private readonly resolvedConfig: ResolvedConfigOptions;
  private readonly enableClientWellKnownLookups: boolean;
  private readonly wellKnownFetcher: (
    domain: string,
  ) => Promise<IClientWellKnown>;
  private readonly logger: Logger;

  public constructor({
    client,
    resolvedConfig,
    enableClientWellKnownLookups,
    wellKnownFetcher,
    logger,
  }: RtcTransportAutoDiscoveryProps) {
    this.client = client;
    this.resolvedConfig = resolvedConfig;
    this.enableClientWellKnownLookups = enableClientWellKnownLookups;
    this.wellKnownFetcher = wellKnownFetcher;
    this.logger = logger.getChild("[RtcTransportAutoDiscovery]");
  }

  public async discoverPreferredTransport(): Promise<LivekitTransportConfig | null> {
    // 1) backend transports
    const backend = await this.tryBackendTransports();
    if (backend.transport) {
      this.logger.info(
        `Found backend transport: ${backend.transport.livekit_service_url}`,
      );
      return backend.transport;
    }

    // 2) .well-known transports
    // Only consulted when the backend endpoint was inconclusive (not attempted
    // or not implemented) and client `.well-known` lookups are enabled. This
    // avoids contacting the homeserver's `server_name` both when a modern
    // endpoint has already given an authoritative answer and when lookups are
    // disabled by config.
    if (backend.mayFallBackToWellKnown && this.enableClientWellKnownLookups) {
      this.logger.info(
        "No backend transport found, falling back to well-known",
      );
      const wellKnownTransport = await this.tryWellKnownTransports();
      if (wellKnownTransport) {
        this.logger.info(
          `Found .well-known transport: ${wellKnownTransport.livekit_service_url}`,
        );
        return wellKnownTransport;
      }
    } else {
      this.logger.info(
        this.enableClientWellKnownLookups
          ? "Skipping .well-known lookup: backend endpoint gave an authoritative response"
          : "Skipping .well-known lookup: client well-known lookups are disabled",
      );
    }

    this.logger.info("Falling back to app config");

    // 3) app config URL
    const configTransport = this.tryConfigTransport();
    if (configTransport) {
      this.logger.info(
        `Found app config transport: ${configTransport.livekit_service_url}`,
      );
      return configTransport;
    }

    return null;
  }

  /**
   * Fetches the first rtc_foci from the backend.
   * This will not throw errors, but instead just log them and return null if the expected config is not found or malformed.
   * @private
   */
  private async tryBackendTransports(): Promise<BackendTransportResult> {
    const client = this.client;
    // MSC4143: Attempt to fetch transports from backend.
    // TODO: Workaround for an issue in the js-sdk RoomWidgetClient that
    // is not yet implementing _unstable_getRTCTransports properly (via widget API new action).
    // For now we just skip this call if we are in a widget.
    // In widget mode the client is a `RoomWidgetClient` which has no access token (it is using the widget API).
    // Could be removed once the js-sdk is fixed (https://github.com/matrix-org/matrix-js-sdk/issues/5245)
    const isSPA = !!client.getAccessToken();
    if (isSPA && "_unstable_getRTCTransports" in client) {
      this.logger.info("First try to use getRTCTransports end point ...");
      try {
        const transportList = await doNetworkOperationWithRetry(async () =>
          client._unstable_getRTCTransports(),
        );
        const first = transportList.find(isLivekitTransportConfig);
        if (first) {
          return { transport: first, mayFallBackToWellKnown: false };
        }
        // The homeserver implements the endpoint but returned no livekit
        // transport. This is an authoritative answer, so we do not fall back
        // to the legacy `.well-known` lookup.
        this.logger.info(
          `No livekit transport found in getRTCTransports end point`,
          transportList,
        );
        return { transport: null, mayFallBackToWellKnown: false };
      } catch (ex) {
        // Only a 404 M_UNRECOGNIZED means the homeserver does not implement the
        // endpoint, which is the one case where falling back to the legacy
        // `.well-known` lookup is appropriate. Any other error is transient or
        // unexpected, so we do not fall back.
        if (ex instanceof MatrixError && ex.errcode === "M_UNRECOGNIZED") {
          this.logger.info(
            "getRTCTransports end point not implemented by homeserver",
          );
          return { transport: null, mayFallBackToWellKnown: true };
        }
        this.logger.warn(`Failed to use getRTCTransports end point: ${ex}`);
        return { transport: null, mayFallBackToWellKnown: false };
      }
    }

    // Not attempted (e.g. widget mode with no access token). Preserve the
    // existing behaviour of allowing the legacy `.well-known` lookup.
    this.logger.debug(`getRTCTransports end point not available`);
    return { transport: null, mayFallBackToWellKnown: true };
  }

  /**
   * Fetches the first rtc_foci from the .well-known/matrix/client.
   * This will not throw errors, but instead just log them and return null if the expected config is not found or malformed.
   * @private
   */
  private async tryWellKnownTransports(): Promise<LivekitTransportConfig | null> {
    // Legacy MSC4143 (to be removed) WELL_KNOWN: Prioritize the .well-known/matrix/client, if available.
    const client = this.client;
    const domain = client.getDomain();
    if (domain) {
      // we use AutoDiscovery instead of relying on the MatrixClient having already
      // been fully configured and started

      const wellKnownFoci = await this.wellKnownFetcher(domain);

      const fociConfig = wellKnownFoci["org.matrix.msc4143.rtc_foci"];
      if (fociConfig) {
        if (!Array.isArray(fociConfig)) {
          this.logger.warn(
            `org.matrix.msc4143.rtc_foci is not an array in .well-known`,
          );
        } else {
          return fociConfig[0];
        }
      } else {
        this.logger.info(
          `No .well-known "org.matrix.msc4143.rtc_foci" found for ${domain}`,
          wellKnownFoci,
        );
      }
    } else {
      // Should never happen, but just in case
      this.logger.warn(`No domain configured for client`);
    }

    return null;
  }

  private tryConfigTransport(): LivekitTransportConfig | null {
    const url = this.resolvedConfig.livekit?.livekit_service_url;
    if (url) {
      return {
        type: "livekit",
        livekit_service_url: url,
      };
    }
    return null;
  }
}
