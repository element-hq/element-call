module.exports = {
  rules: {
    "copyright-header": require("./CopyrightHeader").default,
    "no-observablescope-leak": require("./NoObservableScopeLeak").default,
    "no-top-level-logger-get-child": require("./NoTopLevelLoggerGetChild")
      .default,
  },
};
