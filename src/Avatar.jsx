import React, { useMemo } from "react";
import classNames from "classnames";
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

function hashStringToArrIndex(str, arrLength) {
  let sum = 0;

  for (let i = 0; i < str.length; i++) {
    sum += str.charCodeAt(i);
  }

  return sum % arrLength;
}

export function Avatar({
  bgKey,
  src,
  fallback,
  size,
  className,
  style,
  ...rest
}) {
  const backgroundColor = useMemo(() => {
    const index = hashStringToArrIndex(
      bgKey || fallback || src,
      backgroundColors.length
    );
    return backgroundColors[index];
  }, [bgKey, src, fallback]);

  return (
    <div
      className={classNames(styles.avatar, styles[size || "md"], className)}
      style={{ backgroundColor, ...style }}
      {...rest}
    >
      {src ? (
        <img src={src} />
      ) : typeof fallback === "string" ? (
        <span>{fallback}</span>
      ) : (
        fallback
      )}
    </div>
  );
}
