/*
Copyright 2022 New Vector Ltd

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

import React, { useMemo, CSSProperties } from "react";
import classNames from "classnames";
import { MatrixClient } from "matrix-js-sdk/src/client";

import { getAvatarUrl } from "./matrix-utils";
import { useClient } from "./ClientContext";
import styles from "./Avatar.module.css";

const backgroundColors = [
  "#5C56F5",
  "#03B381",
  "#368BD6",
  "#AC3BA8",
  "#E64F7A",
  "#FF812D",
  "#2DC2C5",
  "#74D12C",
];

export enum Size {
  XS = "xs",
  SM = "sm",
  MD = "md",
  LG = "lg",
  XL = "xl",
}

export const sizes = new Map([
  [Size.XS, 22],
  [Size.SM, 32],
  [Size.MD, 36],
  [Size.LG, 42],
  [Size.XL, 90],
]);

function hashStringToArrIndex(str: string, arrLength: number) {
  let sum = 0;

  for (let i = 0; i < str.length; i++) {
    sum += str.charCodeAt(i);
  }

  return sum % arrLength;
}

const resolveAvatarSrc = (client: MatrixClient, src: string, size: number) =>
  src?.startsWith("mxc://") ? client && getAvatarUrl(client, src, size) : src;

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  bgKey?: string;
  src?: string;
  size?: Size | number;
  className?: string;
  style?: CSSProperties;
  fallback: string;
}

export const Avatar: React.FC<Props> = ({
  bgKey,
  src,
  fallback,
  size = Size.MD,
  className,
  style = {},
  ...rest
}) => {
  const { client } = useClient();

  const [sizeClass, sizePx, sizeStyle] = useMemo(
    () =>
      Object.values(Size).includes(size as Size)
        ? [styles[size as string], sizes.get(size as Size), {}]
        : [
            null,
            size as number,
            {
              width: size,
              height: size,
              borderRadius: size,
              fontSize: Math.round((size as number) / 2),
            },
          ],
    [size]
  );

  const resolvedSrc = useMemo(
    () => resolveAvatarSrc(client, src, sizePx),
    [client, src, sizePx]
  );

  const backgroundColor = useMemo(() => {
    const index = hashStringToArrIndex(
      bgKey || fallback || src || "",
      backgroundColors.length
    );
    return backgroundColors[index];
  }, [bgKey, src, fallback]);

  /* eslint-disable jsx-a11y/alt-text */
  return (
    <div
      className={classNames(styles.avatar, sizeClass, className)}
      style={{ backgroundColor, ...sizeStyle, ...style }}
      {...rest}
    >
      {resolvedSrc ? (
        <img src={resolvedSrc} />
      ) : typeof fallback === "string" ? (
        <span>{fallback}</span>
      ) : (
        fallback
      )}
    </div>
  );
};
