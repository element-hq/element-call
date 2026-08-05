/*
Copyright 2026 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import {
  isLivekitTransportConfig,
  type LivekitTransportConfig,
} from "matrix-js-sdk/lib/matrixrtc";
import { type IClientWellKnown, type MatrixClient } from "matrix-js-sdk";
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
  wellKnownFetcher: (domain: string) => Promise<IClientWellKnown>;
  logger: Logger;
}

export class RtcTransportAutoDiscovery {
  private readonly client: TransportDiscoveryClient;
  private readonly resolvedConfig: ResolvedConfigOptions;
  private readonly wellKnownFetcher: (
    domain: string,
  ) => Promise<IClientWellKnown>;
  private readonly logger: Logger;

  public constructor({
    client,
    resolvedConfig,
    wellKnownFetcher,
    logger,
  }: RtcTransportAutoDiscoveryProps) {
    this.client = client;
    this.resolvedConfig = resolvedConfig;
    this.wellKnownFetcher = wellKnownFetcher;
    this.logger = logger.getChild("[RtcTransportAutoDiscovery]");
  }

  public async discoverPreferredTransport(): Promise<LivekitTransportConfig | null> {
    // 1) backend transports
    const backendTransport = await this.tryBackendTransports();
    if (backendTransport) {
      this.logger.info(
        `Found backend transport: ${backendTransport.livekit_service_url}`,
      );
      return backendTransport;
    }

    this.logger.info("No backend transport found, falling back to well-known");
    // 2) .well-known transports
    const wellKnownTransport = await this.tryWellKnownTransports();
    if (wellKnownTransport) {
      this.logger.info(
        `Found .well-known transport: ${wellKnownTransport.livekit_service_url}`,
      );
      return wellKnownTransport;
    }

    this.logger.info(
      "No .well-known transport found, falling back to app config",
    );

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
  private async tryBackendTransports(): Promise<LivekitTransportConfig | null> {
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
          return first;
        } else {
          this.logger.info(
            `No livekit transport found in getRTCTransports end point`,
            transportList,
          );
        }
      } catch (ex) {
        this.logger.info(`Failed to use getRTCTransports end point: ${ex}`);
      }
    } else {
      this.logger.debug(`getRTCTransports end point not available`);
    }

    return null;
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
