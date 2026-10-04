/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import { type Transport } from "matrix-js-sdk/lib/matrixrtc";
import { type MatrixClient } from "matrix-js-sdk";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { doNetworkOperationWithRetry } from "../utils/network";

type TransportDiscoveryClient = Pick<
  MatrixClient,
  "getDomain" | "_unstable_getRTCTransports"
>;

export interface RtcTransportAutoDiscoveryProps {
  client: TransportDiscoveryClient;
  /** The transport type the media backend serves. */
  transportType: string;
  /** A LiveKit service URL to use when the homeserver advertises none. */
  fallbackTransportUrl?: string;
  logger: Logger;
}

export class RtcTransportAutoDiscovery {
  private readonly client: TransportDiscoveryClient;
  private readonly transportType: string;
  private readonly fallbackTransportUrl: string | undefined;
  private readonly logger: Logger;

  public constructor({
    client,
    transportType,
    fallbackTransportUrl,
    logger,
  }: RtcTransportAutoDiscoveryProps) {
    this.client = client;
    this.transportType = transportType;
    this.fallbackTransportUrl = fallbackTransportUrl;
    this.logger = logger.getChild("[RtcTransportAutoDiscovery]");
  }

  public async discoverPreferredTransport(): Promise<Transport | null> {
    // 1) backend transports
    const backendTransport = await this.tryBackendTransports();
    if (backendTransport) {
      this.logger.info("Found backend transport:", backendTransport);
      return backendTransport;
    }

    // 2) app config URL
    const configTransport = this.tryConfigTransport();
    if (configTransport) {
      this.logger.info("Found app config transport:", configTransport);
      return configTransport;
    }

    return null;
  }

  /**
   * Fetches the first transport of the backend's type from the homeserver.
   * This will not throw errors, but instead just log them and return null if the expected config is not found or malformed.
   * @private
   */
  private async tryBackendTransports(): Promise<Transport | null> {
    const client = this.client;
    // MSC4143: Attempt to fetch transports from backend.
    this.logger.info("First try to use getRTCTransports end point ...");
    try {
      const transportList = await doNetworkOperationWithRetry(async () =>
        client._unstable_getRTCTransports(),
      );
      const first = transportList.find(
        (transport) => transport.type === this.transportType,
      );
      if (first) {
        return first;
      } else {
        this.logger.info(
          `No ${this.transportType} transport found in getRTCTransports end point`,
          transportList,
        );
      }
    } catch (ex) {
      this.logger.info(`Failed to use getRTCTransports end point: ${ex}`);
    }
    return null;
  }

  private tryConfigTransport(): Transport | null {
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
