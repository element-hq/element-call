import { create } from "storybook/theming";
import { addons } from "storybook/manager-api";

addons.setConfig({
  theme: create({
    base: "light",
    colorPrimary: "#1b1d22",
    colorSecondary: "#0467dd",

    // Typography
    fontBase: '"Inter", sans-serif',
    fontCode: '"Inconsolata", monospace',

    // Text colors
    textColor: "#1b1d22",
    appBg: "#ffffff",
    barBg: "#ffffff",

    brandTitle: "Element Call",
    brandUrl: "https://element.io/",
    brandImage: "/src/icons/Logo.svg",
    brandTarget: "_self",
  }),
});
