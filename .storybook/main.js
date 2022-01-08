const svgrPlugin = require("vite-plugin-svgr");
const path = require("path");

module.exports = {
  stories: ["../src/**/*.stories.mdx", "../src/**/*.stories.@(js|jsx|ts|tsx)"],
  addons: ["@storybook/addon-links", "@storybook/addon-essentials"],
  framework: "@storybook/react",
  core: {
    builder: "storybook-builder-vite",
  },
  async viteFinal(config) {
    config.plugins.push(svgrPlugin());
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias["$(res)"] = path.resolve(
      __dirname,
      "../node_modules/matrix-react-sdk/res"
    );
    config.resolve.dedupe = config.resolve.dedupe || [];
    config.resolve.dedupe.push("react", "react-dom", "matrix-js-sdk");
    return config;
  },
};
