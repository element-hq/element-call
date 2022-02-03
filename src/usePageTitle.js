import { useEffect } from "react";

export function usePageTitle(title) {
  useEffect(() => {
    const productName =
      import.meta.env.VITE_PRODUCT_NAME || "Matrix Video Chat";
    document.title = title ? `${productName} | ${title}` : productName;
  }, [title]);
}
