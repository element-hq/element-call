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
}

export interface ResolvedConfigOptions extends ConfigOptions {
  sentry: {
    DSN: string;
    environment: string;
  };
  rageshake: {
    submit_url: string;
  };
}

export const DEFAULT_CONFIG: ResolvedConfigOptions = {
  sentry: { DSN: "", environment: "production" },
  rageshake: {
    submit_url: "https://element.io/bugreports/submit",
  },
};
