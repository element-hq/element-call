import React, { useRef } from "react";
import { useOverlayTriggerState } from "@react-stately/overlays";
import { useButton } from "@react-aria/button";

export function useToggleOverlayButton(overlayState, ref) {
  return useButton(
    {
      onPress: () => overlayState.toggle(),
    },
    ref
  );
}

export function useOpenOverlayButton(overlayState, ref) {
  return useButton(
    {
      onPress: () => overlayState.open(),
    },
    ref
  );
}

export function useCloseOverlayButton(overlayState, ref) {
  return useButton(
    {
      onPress: () => overlayState.close(),
    },
    ref
  );
}

export function Overlay({ children }) {
  const overlayState = useOverlayTriggerState({});
  const buttonRef = useRef();
  const { buttonProps } = useToggleOverlayButton(overlayState, buttonRef);

  if (
    !Array.isArray(children) ||
    children.length > 2 ||
    typeof children[1] !== "function"
  ) {
    throw new Error(
      "Overlay trigger must have two props. The first being a button and the second being a render prop."
    );
  }

  const [overlayTrigger, overlay] = children;

  return (
    <>
      <overlayTrigger.type
        {...overlayTrigger.props}
        {...buttonProps}
        ref={buttonRef}
      />
      {overlayState.isOpen && overlay({ ...overlayState })}
    </>
  );
}
