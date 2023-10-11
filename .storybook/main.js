const svgrPlugin = require("vite-plugin-svgr");
const path = require("path");

module.exports = {
  stories: ["../src/**/*.stories.@(js|jsx|ts|tsx)"],
  framework: "@storybook/react",
  core: {
    builder: "storybook-builder-vite",
  },
  async viteFinal(config) {
    config.plugins = config.plugins.filter(
      (item) =>
        !(
          Array.isArray(item) &&
          item.length > 0 &&
          item[0].name === "vite-plugin-mdx"
        ),
    );
    config.plugins.push(svgrPlugin());
    config.resolve = config.resolve || {};
    config.resolve.dedupe = config.resolve.dedupe || [];
    config.resolve.dedupe.push("react", "react-dom", "matrix-js-sdk");
    return config;
  },
};
