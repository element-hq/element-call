import { defineConfig, mergeConfig } from "vite";
import fullConfig from "./vite.config";
import generateFile from "vite-plugin-generate-file";

const base = "./";

// Config for embedded deployments (possibly hosted under a non-root path)
export default defineConfig((env) =>
  mergeConfig(
    fullConfig({ ...env, packageType: "embedded" }),
    defineConfig({
      base, // Use relative URLs to allow the app to be hosted under any path
      publicDir: false, // Don't serve the public directory which only contains the favicon
      plugins: [
        generateFile([
          {
            type: "json",
            output: "./config.json",
            data: {
              matrix_rtc_session: {
                key_rotation_on_leave_delay: 15000,
                membership_keep_alive_period: 5000,
                membership_server_side_expiry_timeout: 15000,
              },
            },
          },
        ]),
      ],
    }),
  ),
);
