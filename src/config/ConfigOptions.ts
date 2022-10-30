export interface IConfigOptions {
  posthog?: {
    api_key: string;
  };
  sentry?: {
    dns: string;
    environment: string;
  };
  rageshake?: {
    submit_url: string;
  };
}

export const DEFAULT_CONFIG: IConfigOptions = {
  sentry: { dns: "", environment: "production" },
  rageshake: {
    submit_url: "https://element.io/bugreports/submit",
  },
};
