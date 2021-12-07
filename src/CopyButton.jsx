import React from "react";
import { useButton } from "@react-aria/button";
import useClipboard from "react-use-clipboard";
import { ReactComponent as CheckIcon } from "./icons/Check.svg";
import { ReactComponent as CopyIcon } from "./icons/Copy.svg";
import classNames from "classnames";
import styles from "./CopyButton.module.css";

export function CopyButton({ value, className, children, ...rest }) {
  const [isCopied, setCopied] = useClipboard(value, { successDuration: 3000 });
  const { buttonProps } = useButton({
    onPress: () => setCopied(),
  });

  return (
    <button
      {...buttonProps}
      className={classNames(
        styles.copyButton,
        { [styles.copied]: isCopied },
        className
      )}
    >
      {isCopied ? (
        <>
          <span>Copied!</span>
          <CheckIcon />
        </>
      ) : (
        <>
          <span>{children || value}</span>
          <CopyIcon />
        </>
      )}
    </button>
  );
}
