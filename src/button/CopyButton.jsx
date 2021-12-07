import React from "react";
import useClipboard from "react-use-clipboard";
import { ReactComponent as CheckIcon } from "../icons/Check.svg";
import { ReactComponent as CopyIcon } from "../icons/Copy.svg";
import { Button } from "./Button";

export function CopyButton({ value, children, ...rest }) {
  const [isCopied, setCopied] = useClipboard(value, { successDuration: 3000 });

  return (
    <Button {...rest} variant="copy" on={isCopied} onPress={setCopied}>
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
    </Button>
  );
}
