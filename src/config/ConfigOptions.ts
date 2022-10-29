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

export const DEFAULT: IConfigOptions = {};
