/*
Copyright 2022 Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, { Component, forwardRef, ReactNode } from "react";
import classNames from "classnames";
import { Link as RouterLink } from "react-router-dom";

import styles from "./Typography.module.css";

interface TypographyProps {
  children: ReactNode;
  className?: string;
  overflowEllipsis?: boolean;
  [index: string]: unknown;
  fontWeight: number;
}

export const Headline = forwardRef<JSX.Element, TypographyProps>(
  ({ children, className, fontWeight, overflowEllipsis, ...rest }, ref) => {
    return (
      <h1
        {...rest}
        className={classNames(
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </h1>
    );
  }
);

export const Title = forwardRef<Component, TypographyProps>(
  ({ children, className, fontWeight, overflowEllipsis, ...rest }, ref) => {
    return (
      <h2
        {...rest}
        className={classNames(
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </h2>
    );
  }
);

export const Subtitle = forwardRef(
  ({ children, className, fontWeight, overflowEllipsis, ...rest }, ref) => {
    return (
      <h3
        {...rest}
        className={classNames(
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </h3>
    );
  }
);

export const Body = forwardRef<JSX.Element, TypographyProps>(
  ({ children, className, fontWeight, overflowEllipsis, ...rest }, ref) => {
    return (
      <p
        {...rest}
        className={classNames(
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </p>
    );
  }
);

export const Caption = forwardRef(
  ({ children, className, fontWeight, overflowEllipsis, ...rest }, ref) => {
    return (
      <p
        {...rest}
        className={classNames(
          styles.caption,
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </p>
    );
  }
);

export const Micro = forwardRef(
  ({ children, className, fontWeight, overflowEllipsis, ...rest }, ref) => {
    return (
      <p
        {...rest}
        className={classNames(
          styles.micro,
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </p>
    );
  }
);

export const Link = forwardRef(
  (
    {
      as,
      children,
      className,
      color = "link",
      href,
      to,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref
  ) => {
    const Component = as || (to ? RouterLink : "a");
    let externalLinkProps;

    if (href) {
      externalLinkProps = {
        href,
        target: "_blank",
        rel: "noreferrer noopener",
      };
    }

    return (
      <Component
        {...externalLinkProps}
        {...rest}
        to={to}
        className={classNames(
          styles[color],
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);
