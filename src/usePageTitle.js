import { useEffect } from "react";

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title
      ? `${import.meta.env.VITE_PRODUCT_NAME} | ${title}`
      : import.meta.env.VITE_PRODUCT_NAME;
  }, [title]);
}
