/*
Copyright 2022-2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The MatrixRTC mode determines how Element Call interacts with the
 * MatrixRTC backend and other participants. Selectable via the Developer
 * Settings, or pinned for a deployment via `matrix_rtc_mode` in config.json.
 */
export enum MatrixRTCMode {
  /** Legacy single-SFU + user-keyed memberships + legacy JWT endpoint. */
  Legacy = "legacy",
  /** Multi-SFU transport, legacy JWT endpoint, no sticky events. */
  Compatibility = "compatibility",
  /**
   * Multi-SFU transport with:
   *  - sticky events
   *  - hashed RTC backend identity
   *  - the new endpoint for the jwt token on the local membership (remote memberships will always try the new jwt endpoint first -> then the legacy one)
   *  - use the hashed identity for the local membership
   */
  Matrix_2_0 = "matrix_2_0",
}

export interface ConfigOptions {
  /**
   * The Posthog endpoint to which analytics data will be sent.
   * This is only used in the full package of Element Call.
   */
  posthog?: {
    api_key: string;
    api_host: string;
  };

  /**
   * The Sentry endpoint to which crash data will be sent.
   * This is only used in the full package of Element Call.
   */
  sentry?: {
    DSN: string;
    environment: string;
  };

  /**
   * The rageshake server to which feedback and debug logs will be sent.
   * This is only used in the full package of Element Call.
   */
  rageshake?: {
    submit_url: string;
  };

  /**
   * Sets the URL to send opentelemetry data to. If unset, opentelemetry will
   * be disabled. This is only used in the full package of Element Call.
   */
  opentelemetry?: {
    collector_url: string;
  };

  // Describes the default homeserver to use. The same format as Element Web
  // (without identity servers as we don't use them).
  default_server_config?: {
    ["m.homeserver"]: {
      base_url: string;
      server_name: string;
    };
  };

  // Describes the LiveKit configuration to be used.
  livekit?: {
    // The link to the service that returns a livekit url and token to use it.
    // This is a fallback link in case the homeserver in use does not advertise
    // a livekit service url over the transports endpoint.
    livekit_service_url: string;
  };

  /**
   * TEMPORARY experimental features.
   */
  features?: {
    /**
     * Allow to join group calls without audio and video.
     */
    feature_group_calls_without_video_and_audio?: boolean;

    /**
     * Send device-specific call session membership state events instead of
     * legacy user-specific call membership state events.
     * This setting has no effect when the user joins an active call with
     * legacy state events. For compatibility, Element Call will always join
     * active legacy calls with legacy state events.
     */
    feature_use_device_session_member_events?: boolean;
  };

  /**
   * A link to the software and services license agreement (SSLA)
   */
  ssla?: string;

  /**
   * Media quality settings for video and screen sharing.
   * These override the hardcoded LiveKit defaults.
   */
  media_quality?: {
    /**
     * Video codec preference. The server must also have the codec enabled.
     * @default "vp8"
     */
    video_codec?: "vp8" | "vp9" | "h264" | "av1";

    /**
     * Camera video settings.
     */
    video?: {
      /** Max resolution height in pixels (e.g. 720, 1080, 1440). @default 720 */
      max_resolution?: number;
      /** Max bitrate in bits per second. @default 1700000 */
      max_bitrate?: number;
      /** Max framerate. @default 30 */
      max_framerate?: number;
      /**
       * Simulcast layers as an array of {height, bitrate} objects,
       * ordered from lowest to highest quality.
       * @default [{height: 180, bitrate: 160000}, {height: 360, bitrate: 450000}]
       */
      simulcast_layers?: Array<{
        height: number;
        bitrate: number;
      }>;
    };

    /**
     * Screen share settings.
     */
    screen_share?: {
      /** Max resolution height in pixels. @default 1080 */
      max_resolution?: number;
      /** Max bitrate in bits per second. @default 5000000 */
      max_bitrate?: number;
      /** Max framerate. @default 30 */
      max_framerate?: number;
      /**
       * Simulcast layers for screen sharing as an array of {height, bitrate, framerate} objects,
       * ordered from lowest to highest quality. If omitted, LiveKit SDK defaults apply (1 extra
       * layer at half resolution).
       */
      simulcast_layers?: Array<{
        height: number;
        bitrate: number;
        framerate?: number;
      }>;
    };
  };

  media_devices?: {
    /**
     * Defines whether participants should start with audio enabled by default.
     */
    enable_audio?: boolean;

    /**
     * Defines whether participants should start with video enabled by default.
     */
    enable_video?: boolean;
  };

  /**
   * Grace period in milliseconds to wait before reporting the sync loop as disconnected.
   * This allows brief sync interruptions without triggering a reconnection message.
   * Default is 10000ms (10 seconds). Set to 0 to disable the grace period.
   */
  sync_disconnect_grace_period_ms?: number;

  /**
   * Pins the {@link MatrixRTCMode} for all clients on this deployment,
   * overriding any per-user choice from the Developer Settings. If unset,
   * the user's Developer Settings choice (or its default of `Legacy`) wins.
   */
  matrix_rtc_mode?: MatrixRTCMode;

  /**
   * These are low level options that are used to configure the MatrixRTC session.
   * Take care when changing these options.
   */
  matrix_rtc_session?: {
    /**
     * How long (in milliseconds) to wait before rotating end-to-end media encryption keys
     * when someone leaves a call.
     */
    wait_for_key_rotation_ms?: number;

    /**
     * The duration (in milliseconds) after the most recent keep-alive (delayed leave event restart)
     * that the server waits before sending the leave MatrixRTC membership event.
     */
    delayed_leave_event_delay_ms?: number;

    /**
     * The time (in milliseconds) after which we consider a delayed event restart http request to have failed.
     * Setting this to a lower value will result in more frequent retries but also a higher chance of failiour.
     *
     * In the presence of network packet loss (hurting TCP connections), the custom delayedEventRestartLocalTimeoutMs
     * helps by keeping more delayed event reset candidates in flight,
     * improving the chances of a successful reset. (its is equivalent to the js-sdk `localTimeout` configuration,
     * but only applies to calls to the `_unstable_updateDelayedEvent` endpoint with a body of `{action:"restart"}`.)
     */
    delayed_leave_event_restart_local_timeout_ms?: number;

    /**
     * The time interval (in milliseconds) at which the client sends membership keep-alive
     * messages to the server by restarting the timer for the delayed leave event.
     */
    delayed_leave_event_restart_ms?: number;

    /**
     * How long we wait before retrying after a network error on any of the requests.
     */
    network_error_retry_ms?: number;

    /**
     * The timeout (in milliseconds) after we joined the call, that our membership should expire
     * unless we have explicitly updated it.
     *
     * This is what goes into the m.rtc.member event expiry field and is typically set to a number of hours.
     */
    membership_event_expiry_ms?: number;
  };
}

// Overrides members from ConfigOptions that are always provided by the
// default config and are therefore non-optional.
export interface ResolvedConfigOptions extends ConfigOptions {
  sync_disconnect_grace_period_ms: number;
  ssla: string;
  media_quality: Required<
    Pick<NonNullable<ConfigOptions["media_quality"]>, "video_codec">
  > & {
    video: Required<
      Pick<
        NonNullable<NonNullable<ConfigOptions["media_quality"]>["video"]>,
        "max_resolution" | "max_bitrate" | "max_framerate"
      >
    >;
    screen_share: Required<
      Pick<
        NonNullable<
          NonNullable<ConfigOptions["media_quality"]>["screen_share"]
        >,
        "max_resolution" | "max_bitrate" | "max_framerate"
      >
    >;
  };
  matrix_rtc_session: {
    wait_for_key_rotation_ms?: number;
    delayed_leave_event_delay_ms: number;
    delayed_leave_event_restart_local_timeout_ms?: number;
    delayed_leave_event_restart_ms?: number;
    network_error_retry_ms: number;
    membership_event_expiry_ms?: number;
  };
}

export const DEFAULT_CONFIG: ResolvedConfigOptions = {
  features: {
    feature_use_device_session_member_events: true,
  },
  sync_disconnect_grace_period_ms: 10000,
  ssla: "https://static.element.io/legal/element-software-and-services-license-agreement-uk-1.pdf",
  media_quality: {
    video_codec: "vp8",
    video: {
      max_resolution: 720,
      max_bitrate: 1_700_000,
      max_framerate: 30,
    },
    screen_share: {
      max_resolution: 1080,
      max_bitrate: 5_000_000,
      max_framerate: 30,
    },
  },
  matrix_rtc_session: {
    delayed_leave_event_delay_ms: 10000,
    network_error_retry_ms: 1000,
  },
};
