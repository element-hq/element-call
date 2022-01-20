import React, { forwardRef, useRef } from "react";
import { useTooltipTriggerState } from "@react-stately/tooltip";
import { FocusableProvider } from "@react-aria/focus";
import { useTooltipTrigger, useTooltip } from "@react-aria/tooltip";
import { mergeProps, useObjectRef } from "@react-aria/utils";
import styles from "./Tooltip.module.css";
import classNames from "classnames";
import { OverlayContainer, useOverlayPosition } from "@react-aria/overlays";

export const Tooltip = forwardRef(
  ({ position, state, className, ...props }, ref) => {
    let { tooltipProps } = useTooltip(props, state);

    return (
      <div
        className={classNames(styles.tooltip, className)}
        {...mergeProps(props, tooltipProps)}
        ref={ref}
      >
        {props.children}
      </div>
    );
  }
);

export const TooltipTrigger = forwardRef(({ children, ...rest }, ref) => {
  const tooltipState = useTooltipTriggerState(rest);
  const triggerRef = useObjectRef(ref);
  const overlayRef = useRef();
  const { triggerProps, tooltipProps } = useTooltipTrigger(
    rest,
    tooltipState,
    triggerRef
  );

  const { overlayProps } = useOverlayPosition({
    placement: rest.placement || "top",
    targetRef: triggerRef,
    overlayRef,
    isOpen: tooltipState.isOpen,
    offset: 5,
  });

  if (
    !Array.isArray(children) ||
    children.length > 2 ||
    typeof children[1] !== "function"
  ) {
    throw new Error(
      "TooltipTrigger must have two props. The first being a button and the second being a render prop."
    );
  }

  const [tooltipTrigger, tooltip] = children;

  return (
    <FocusableProvider ref={triggerRef} {...triggerProps}>
      {<tooltipTrigger.type {...mergeProps(tooltipTrigger.props, rest)} />}
      {tooltipState.isOpen && (
        <OverlayContainer>
          <Tooltip
            state={tooltipState}
            {...mergeProps(tooltipProps, overlayProps)}
            ref={overlayRef}
          >
            {tooltip()}
          </Tooltip>
        </OverlayContainer>
      )}
    </FocusableProvider>
  );
});

TooltipTrigger.defaultProps = {
  delay: 250,
};
