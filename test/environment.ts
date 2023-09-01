import { TextEncoder } from "util";
import JSDOMEnvironment_, {
  TestEnvironment as TestEnvironment_,
} from "jest-environment-jsdom";
import { JestEnvironmentConfig, EnvironmentContext } from "@jest/environment";

// This is a patched version of jsdom that adds TextEncoder, as a workaround for
// https://github.com/jsdom/jsdom/issues/2524
// Once that issue is resolved, this custom environment file can be deleted
export default class JSDOMEnvironment extends JSDOMEnvironment_ {
  constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
    super(config, context);
    this.global.TextEncoder ??= TextEncoder;
  }
}

export const TestEnvironment =
  TestEnvironment_ === JSDOMEnvironment_ ? JSDOMEnvironment : TestEnvironment_;
