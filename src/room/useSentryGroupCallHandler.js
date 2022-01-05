import * as Sentry from "@sentry/react";

export function useSentryGroupCallHandler(groupCall) {
  useEffect(() => {
    function onHangup(call) {
      if (call.hangupReason === "ice_failed") {
        Sentry.captureException(new Error("Call hangup due to ICE failure."));
      }
    }

    function onError(error) {
      Sentry.captureException(error);
    }

    if (groupCall) {
      groupCall.on("hangup", onHangup);
      groupCall.on("error", onError);
    }

    return () => {
      if (groupCall) {
        groupCall.removeListener("hangup", onHangup);
        groupCall.removeListener("error", onError);
      }
    };
  }, [groupCall]);
}
