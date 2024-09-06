/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { createElement, forwardRef, ReactNode } from "react";
import classNames from "classnames";
import { Link as RouterLink } from "react-router-dom";
import * as H from "history";

import styles from "./Typography.module.css";

interface TypographyProps {
  children: ReactNode;
  fontWeight?: string;
  className?: string;
  overflowEllipsis?: boolean;
  as?: string;
}

export const Headline = forwardRef<HTMLHeadingElement, TypographyProps>(
  (
    {
      as: Component = "h1",
      children,
      className,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref,
  ) => {
    return createElement(
      Component,
      {
        ...rest,
        className: classNames(
          styles[fontWeight ?? ""],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className,
        ),
        ref,
      },
      children,
    );
  },
);

Headline.displayName = "Headline";

export const Title = forwardRef<HTMLHeadingElement, TypographyProps>(
  (
    {
      as: Component = "h2",
      children,
      className,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref,
  ) => {
    return createElement(
      Component,
      {
        ...rest,
        className: classNames(
          styles[fontWeight ?? ""],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className,
        ),
        ref,
      },
      children,
    );
  },
);

Title.displayName = "Title";

export const Subtitle = forwardRef<HTMLParagraphElement, TypographyProps>(
  (
    {
      as: Component = "h3",
      children,
      className,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref,
  ) => {
    return createElement(
      Component,
      {
        ...rest,
        className: classNames(
          styles[fontWeight ?? ""],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className,
        ),
        ref,
      },
      children,
    );
  },
);

Subtitle.displayName = "Subtitle";

export const Body = forwardRef<HTMLParagraphElement, TypographyProps>(
  (
    {
      as: Component = "p",
      children,
      className,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref,
  ) => {
    return createElement(
      Component,
      {
        ...rest,
        className: classNames(
          styles[fontWeight ?? ""],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className,
        ),
        ref,
      },
      children,
    );
  },
);

Body.displayName = "Body";

export const Caption = forwardRef<HTMLParagraphElement, TypographyProps>(
  (
    {
      as: Component = "p",
      children,
      className,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref,
  ) => {
    return createElement(
      Component,
      {
        ...rest,
        className: classNames(
          styles.caption,
          styles[fontWeight ?? ""],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className,
        ),
        ref,
      },
      children,
    );
  },
);

Caption.displayName = "Caption";

export const Micro = forwardRef<HTMLParagraphElement, TypographyProps>(
  (
    {
      as: Component = "p",
      children,
      className,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref,
  ) => {
    return createElement(
      Component,
      {
        ...rest,
        className: classNames(
          styles.micro,
          styles[fontWeight ?? ""],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className,
        ),
        ref,
      },
      children,
    );
  },
);

Micro.displayName = "Micro";

interface LinkProps extends TypographyProps {
  to?: H.LocationDescriptor<unknown>;
  color?: string;
  href?: string;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
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
    ref,
  ) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const Component: string | RouterLink = as || (to ? RouterLink : "a");
    let externalLinkProps: { href: string; target: string; rel: string };

    if (href) {
      externalLinkProps = {
        href,
        target: "_blank",
        rel: "noreferrer noopener",
      };
    }

    return createElement(
      Component,
      {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        ...externalLinkProps,
        ...rest,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        to: to,
        className: classNames(
          styles[color],
          styles[fontWeight ?? ""],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className,
        ),
        ref: ref,
      },
      children,
    );
  },
);

Link.displayName = "Link";
