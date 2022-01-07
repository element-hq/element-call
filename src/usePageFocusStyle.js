import { useEffect } from "react";
import { useFocusVisible } from "@react-aria/interactions";
import styles from "./usePageFocusStyle.module.css";

export function usePageFocusStyle() {
  const { isFocusVisible } = useFocusVisible();

  useEffect(() => {
    const classList = document.body.classList;
    const hasClass = classList.contains(styles.hideFocus);

    if (isFocusVisible && hasClass) {
      classList.remove(styles.hideFocus);
    } else if (!isFocusVisible && !hasClass) {
      classList.add(styles.hideFocus);
    }

    return () => {
      classList.remove(styles.hideFocus);
    };
  }, [isFocusVisible]);
}
