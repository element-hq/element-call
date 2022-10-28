export interface IConfigOptions{
  posthog?: {
    api_key: string;
  }
}

export const DEFAULT: IConfigOptions = {}