import React from "react";
import useClipboard from "react-use-clipboard";
import { ReactComponent as CheckIcon } from "../icons/Check.svg";
import { ReactComponent as CopyIcon } from "../icons/Copy.svg";
import { Button } from "./Button";

export function CopyButton({
  value,
  children,
  className,
  variant,
  copiedMessage,
  ...rest
}) {
  const [isCopied, setCopied] = useClipboard(value, { successDuration: 3000 });

  return (
    <Button
      {...rest}
      variant={variant === "icon" ? "iconCopy" : variant || "copy"}
      on={isCopied}
      className={className}
      onPress={setCopied}
      iconStyle={isCopied ? "stroke" : "fill"}
    >
      {isCopied ? (
        <>
          {variant !== "icon" && <span>{copiedMessage || "Copied!"}</span>}
          <CheckIcon />
        </>
      ) : (
        <>
          {variant !== "icon" && <span>{children || value}</span>}
          <CopyIcon />
        </>
      )}
    </Button>
  );
}
