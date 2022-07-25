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

import React from "react";
import { Link } from "react-router-dom";
import classNames from "classnames";
import * as H from "history";

import {
  variantToClassName,
  sizeToClassName,
  ButtonVariant,
  ButtonSize,
} from "./Button";
interface Props {
  className: string;
  variant: ButtonVariant;
  size: ButtonSize;
  children: JSX.Element | string;
  to: H.LocationDescriptor | ((location: H.Location) => H.LocationDescriptor);
  // TODO: add all props for <Link>
  [index: string]: unknown;
}

export function LinkButton({
  className,
  variant,
  size,
  children,
  to,
  ...rest
}: Props) {
  return (
    <Link
      className={classNames(
        variantToClassName[variant || "secondary"],
        sizeToClassName[size],
        className
      )}
      to={to}
      {...rest}
    >
      {children}
    </Link>
  );
}
