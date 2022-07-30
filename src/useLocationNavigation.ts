import { useEffect } from "react";
import { useHistory } from "react-router-dom";

export function useLocationNavigation(enabled = false): void {
  const history = useHistory();

  useEffect(() => {
    let unblock;

    if (enabled) {
      unblock = history.block((tx) => {
        const url = new URL(tx.pathname, window.location.href);
        url.search = tx.search;
        url.hash = tx.hash;
        window.location.href = url.href;
      });
    }

    return () => {
      if (unblock) {
        unblock();
      }
    };
  }, [history, enabled]);
}
