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

export interface TransportAutoDiscoveryProps {
  client: TransportDiscoveryClient;
  /** The transport type the media backend serves. */
  transportType: string;
  /** A transport to use when the homeserver advertises none of the type. */
  fallbackTransport?: Transport;
  logger: Logger;
}

export class TransportAutoDiscovery {
  private readonly client: TransportDiscoveryClient;
  private readonly transportType: string;
  private readonly fallbackTransport: Transport | undefined;
  private readonly logger: Logger;

  public constructor({
    client,
    transportType,
    fallbackTransport,
    logger,
  }: TransportAutoDiscoveryProps) {
    this.client = client;
    this.transportType = transportType;
    this.fallbackTransport = fallbackTransport;
    this.logger = logger.getChild("[TransportAutoDiscovery]");
  }

  public async discoverPreferredTransport(): Promise<Transport | null> {
    // 1) backend transports
    const backendTransport = await this.tryBackendTransports();
    if (backendTransport) {
      this.logger.info(
        `Found backend transport: ${JSON.stringify(backendTransport)}`,
      );
      return backendTransport;
    }

    // 2) the host's fallback
    if (this.fallbackTransport) {
      this.logger.info(
        `Found fallback transport: ${JSON.stringify(this.fallbackTransport)}`,
      );
      return this.fallbackTransport;
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
}
