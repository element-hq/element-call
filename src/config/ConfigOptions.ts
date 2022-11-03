export interface IConfigOptions {
  posthog?: {
    api_key: string;
  };
  sentry?: {
    DSN: string;
    environment: string;
  };
  rageshake?: {
    submit_url: string;
  };
}

export const DEFAULT_CONFIG: IConfigOptions = {
  sentry: { DSN: "", environment: "production" },
  rageshake: {
    submit_url: "https://element.io/bugreports/submit",
  },
};
