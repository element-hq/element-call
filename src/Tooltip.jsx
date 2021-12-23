import React, { forwardRef } from "react";
import { useTooltipTriggerState } from "@react-stately/tooltip";
import { useTooltipTrigger, useTooltip } from "@react-aria/tooltip";
import { mergeProps, useObjectRef } from "@react-aria/utils";
import styles from "./Tooltip.module.css";
import classNames from "classnames";

export function Tooltip({ position, state, ...props }) {
  let { tooltipProps } = useTooltip(props, state);

  return (
    <div
      className={classNames(styles.tooltip, styles[position || "bottom"])}
      {...mergeProps(props, tooltipProps)}
    >
      {props.children}
    </div>
  );
}

export const TooltipTrigger = forwardRef(({ children, ...rest }, ref) => {
  const tooltipState = useTooltipTriggerState(rest);
  const triggerRef = useObjectRef(ref);
  const { triggerProps, tooltipProps } = useTooltipTrigger(
    rest,
    tooltipState,
    triggerRef
  );

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
    <div className={styles.tooltipContainer}>
      <tooltipTrigger.type
        {...mergeProps(triggerProps, tooltipTrigger.props, rest)}
        ref={triggerRef}
      />
      {tooltipState.isOpen && tooltip({ state: tooltipState, ...tooltipProps })}
    </div>
  );
});

TooltipTrigger.defaultProps = {
  delay: 250,
};
