import React, {
  ForwardedRef,
  forwardRef,
  ReactElement,
  ReactNode,
  useRef,
} from "react";
import {
  TooltipTriggerState,
  useTooltipTriggerState,
} from "@react-stately/tooltip";
import { FocusableProvider } from "@react-aria/focus";
import { useTooltipTrigger, useTooltip } from "@react-aria/tooltip";
import { mergeProps, useObjectRef } from "@react-aria/utils";
import classNames from "classnames";
import { OverlayContainer, useOverlayPosition } from "@react-aria/overlays";
import { Placement } from "@react-types/overlays";

import styles from "./Tooltip.module.css";

interface TooltipProps {
  className?: string;
  state: TooltipTriggerState;
  children: ReactNode;
}

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  (
    { state, className, children, ...rest }: TooltipProps,
    ref: ForwardedRef<HTMLDivElement>
  ) => {
    const { tooltipProps } = useTooltip(rest, state);

    return (
      <div
        className={classNames(styles.tooltip, className)}
        {...mergeProps(rest, tooltipProps)}
        ref={ref}
      >
        {children}
      </div>
    );
  }
);

interface TooltipTriggerProps {
  children: ReactElement;
  placement?: Placement;
  delay?: number;
  tooltip: () => string;
}

export const TooltipTrigger = forwardRef<HTMLElement, TooltipTriggerProps>(
  (
    { children, placement, tooltip, ...rest }: TooltipTriggerProps,
    ref: ForwardedRef<HTMLElement>
  ) => {
    const tooltipTriggerProps = { delay: 250, ...rest };
    const tooltipState = useTooltipTriggerState(tooltipTriggerProps);
    const triggerRef = useObjectRef<HTMLElement>(ref);
    const overlayRef = useRef();
    const { triggerProps, tooltipProps } = useTooltipTrigger(
      tooltipTriggerProps,
      tooltipState,
      triggerRef
    );

    const { overlayProps } = useOverlayPosition({
      placement: placement || "top",
      targetRef: triggerRef,
      overlayRef,
      isOpen: tooltipState.isOpen,
      offset: 5,
    });

    return (
      <FocusableProvider ref={triggerRef} {...triggerProps}>
        <children.type
          {...mergeProps<typeof children.props | typeof rest>(
            children.props,
            rest
          )}
        />
        {tooltipState.isOpen && (
          <OverlayContainer>
            <Tooltip
              state={tooltipState}
              ref={overlayRef}
              {...mergeProps(tooltipProps, overlayProps)}
            >
              {tooltip()}
            </Tooltip>
          </OverlayContainer>
        )}
      </FocusableProvider>
    );
  }
);
