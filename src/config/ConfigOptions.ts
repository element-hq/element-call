export interface ConfigOptions {
  /**
   * The Posthog endpoint to which analytics data will be sent.
   */
  posthog?: {
    api_key: string;
    api_host: string;
  };
  /**
   * The Sentry endpoint to which crash data will be sent.
   */
  sentry?: {
    DSN: string;
    environment: string;
  };
  /**
   * The rageshake server to which feedback and debug logs will be sent.
   */
  rageshake?: {
    submit_url: string;
  };

  // Describes the default homeserver to use. The same format as Element Web
  // (without identity servers as we don't use them).
  default_server_config: {
    ["m.homeserver"]: {
      base_url: string;
      server_name: string;
    };
  };
}

export const DEFAULT_CONFIG: ConfigOptions = {
  default_server_config: {
    ["m.homeserver"]: {
      base_url: "http://localhost:8008",
      server_name: "localhost",
    },
  },
};
