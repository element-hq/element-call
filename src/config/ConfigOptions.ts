/*
Copyright 2022-2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

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
    // a livekit service url in the client well-known.
    // The well known needs to be formatted like so:
    // {"type":"livekit", "livekit_service_url":"https://livekit.example.com"}
    // and stored under the key: "org.matrix.msc4143.rtc_foci"
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
  default_server_config: {
    ["m.homeserver"]: {
      base_url: string;
      server_name: string;
    };
  };
  ssla: string;
}

export const DEFAULT_CONFIG: ResolvedConfigOptions = {
  default_server_config: {
    ["m.homeserver"]: {
      base_url: "http://localhost:8008",
      server_name: "localhost",
    },
  },
  features: {
    feature_use_device_session_member_events: true,
  },
  ssla: "https://static.element.io/legal/element-software-and-services-license-agreement-uk-1.pdf",
};
