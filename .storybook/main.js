const svgrPlugin = require("vite-plugin-svgr");

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
        )
    );
    config.plugins.push(svgrPlugin());
    return config;
  },
};
