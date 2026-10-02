/*
Copyright 2026 Element Creations Ltd.

SPDX-License-IdFentifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import {
  isLivekitTransport,
  type LivekitTransport,
} from "matrix-js-sdk/lib/matrixrtc";
import { type MatrixClient } from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { doNetworkOperationWithRetry } from "../utils/network";

type TransportDiscoveryClient = Pick<
  MatrixClient,
  "getDomain" | "_unstable_getRTCTransports"
>;

export interface RtcTransportAutoDiscoveryProps {
  client: TransportDiscoveryClient;
  /** A transport to use when the homeserver advertises none. */
  fallbackTransportUrl?: string;
  logger: Logger;
}

export class RtcTransportAutoDiscovery {
  private readonly client: TransportDiscoveryClient;
  private readonly fallbackTransportUrl: string | undefined;
  private readonly logger: Logger;

  public constructor({
    client,
    fallbackTransportUrl,
    logger,
  }: RtcTransportAutoDiscoveryProps) {
    this.client = client;
    this.fallbackTransportUrl = fallbackTransportUrl;
    this.logger = logger.getChild("[RtcTransportAutoDiscovery]");
  }

  public async discoverPreferredTransport(): Promise<LivekitTransport | null> {
    // 1) backend transports
    const backendTransport = await this.tryBackendTransports();
    if (backendTransport) {
      this.logger.info(
        `Found backend transport: ${backendTransport.livekit_service_url}`,
      );
      return backendTransport;
    }

    // 2) app config URL
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
  private async tryBackendTransports(): Promise<LivekitTransport | null> {
    const client = this.client;
    // MSC4143: Attempt to fetch transports from backend.
    this.logger.info("First try to use getRTCTransports end point ...");
    try {
      const transportList = await doNetworkOperationWithRetry(async () =>
        client._unstable_getRTCTransports(),
      );
      const first = transportList.find(isLivekitTransport);
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
    return null;
  }

  private tryConfigTransport(): LivekitTransport | null {
    const url = this.fallbackTransportUrl;
    if (url) {
      return {
        type: "livekit",
        livekit_service_url: url,
      };
    }
    return null;
  }
}
