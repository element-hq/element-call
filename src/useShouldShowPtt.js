import { useLocation } from "react-router-dom";

export function useShouldShowPtt() {
  const { hash } = useLocation();
  return hash.startsWith("#ptt");
}
