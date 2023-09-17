/*
Copyright 2023 New Vector Ltd

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

import {
  ComponentPropsWithoutRef,
  ReactNode,
  forwardRef,
  Children,
} from "react";
import classNames from "classnames";

import styles from "./Glass.module.css";

interface Props extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  className?: string;
  /**
   * Increases the blur effect.
   * @default false
   */
  frosted?: boolean;
}

/**
 * Adds a border of glass around a child component.
 */
export const Glass = forwardRef<HTMLDivElement, Props>(
  ({ frosted = false, children, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={classNames(className, styles.glass, {
        [styles.frosted]: frosted,
      })}
      {...rest}
    >
      {Children.only(children)}
    </div>
  )
);
