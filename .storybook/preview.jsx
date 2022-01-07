import React from "react";
import { addDecorator } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import { usePageFocusStyle } from "../src/usePageFocusStyle";
import { OverlayProvider } from "@react-aria/overlays";
import "../src/index.css";

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

addDecorator((story) => {
  usePageFocusStyle();
  return (
    <MemoryRouter initialEntries={["/"]}>
      <OverlayProvider>{story()}</OverlayProvider>
    </MemoryRouter>
  );
});
