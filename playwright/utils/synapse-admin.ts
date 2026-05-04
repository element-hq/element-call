/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createHmac } from "crypto";

/**
 * Response from Synapse registration API
 */
export interface SynapseRegistrationResponse {
  access_token: string;
  user_id: string;
  home_server: string;
  device_id: string;
}

/**
 * Utility class for interacting with Synapse Admin API
 * This provides fast user registration without going through the UI
 *
 * @see https://matrix-org.github.io/synapse/latest/admin_api/register_api.html
 */
export class SynapseAdmin {
  public constructor(
    private baseUrl: string = "https://synapse.m.localhost",
    private sharedSecret: string = "test_shared_secret_for_local_dev_only",
  ) {}

  /**
   * Register a user using the Synapse Admin API
   * This is much faster than going through the UI registration flow
   *
   * @param username - The username (localpart) for the new user
   * @param password - The password for the new user
   * @param displayName - Optional display name (defaults to username)
   * @param admin - Whether the user should be an admin (defaults to false)
   * @returns Registration response containing access token and user ID
   */
  public async registerUser(
    username: string,
    password: string,
    displayName?: string,
    admin: boolean = false,
  ): Promise<SynapseRegistrationResponse> {
    // Get a nonce first
    const nonce = await this.getNonce();

    // Generate the HMAC
    const mac = this.generateMac(username, password, admin, nonce);

    // Make the registration request
    const response = await fetch(`${this.baseUrl}/_synapse/admin/v1/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nonce,
        username,
        password,
        displayname: displayName || username,
        admin,
        mac,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to register user ${username}: ${response.status} ${error}`,
      );
    }

    return response.json();
  }

  /**
   * Get a nonce for registration
   * The nonce is required for the HMAC calculation
   *
   * @returns A nonce string
   */
  private async getNonce(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/_synapse/admin/v1/register`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get nonce: ${response.status} ${await response.text()}`,
      );
    }

    const data = await response.json();
    return data.nonce;
  }

  /**
   * Generate HMAC for shared secret registration
   * This is the authentication mechanism for the admin API
   *
   * @param username - The username
   * @param password - The password
   * @param admin - Whether the user is an admin
   * @param nonce - The nonce from the server
   * @returns The HMAC hex string
   */
  private generateMac(
    username: string,
    password: string,
    admin: boolean,
    nonce: string,
  ): string {
    const mac = createHmac("sha1", this.sharedSecret);
    mac.update(nonce);
    mac.update("\x00");
    mac.update(username);
    mac.update("\x00");
    mac.update(password);
    mac.update("\x00");
    mac.update(admin ? "admin" : "notadmin");

    return mac.digest("hex");
  }

  /**
   * Create a new SynapseAdmin instance for a different homeserver
   *
   * @param baseUrl - The base URL of the homeserver
   * @param sharedSecret - The shared secret (defaults to test secret)
   * @returns A new SynapseAdmin instance
   */
  public static forHomeserver(
    baseUrl: string,
    sharedSecret: string = "test_shared_secret_for_local_dev_only",
  ): SynapseAdmin {
    return new SynapseAdmin(baseUrl, sharedSecret);
  }
}
