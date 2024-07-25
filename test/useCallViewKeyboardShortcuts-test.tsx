/*
Copyright 2024 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { render } from "@testing-library/react";
import { FC, useRef } from "react";
import { test } from "vitest";
import { Button } from "@vector-im/compound-web";
import userEvent from "@testing-library/user-event";

import { useCallViewKeyboardShortcuts } from "../src/useCallViewKeyboardShortcuts";

interface TestComponentProps {
  setMicrophoneMuted: (muted: boolean) => void;
  onButtonClick?: () => void;
}

const TestComponent: FC<TestComponentProps> = ({
  setMicrophoneMuted,
  onButtonClick = (): void => {},
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useCallViewKeyboardShortcuts(
    ref,
    () => {},
    () => {},
    setMicrophoneMuted,
  );
  return (
    <div ref={ref}>
      <Button onClick={onButtonClick}>I'm a button</Button>
    </div>
  );
};

test("spacebar unmutes", async () => {
  const user = userEvent.setup();
  let muted = true;
  render(<TestComponent setMicrophoneMuted={(m) => (muted = m)} />);

  await user.keyboard("[Space>]");
  expect(muted).toBe(false);
  await user.keyboard("[/Space]");
  expect(muted).toBe(true);
});

test("spacebar prioritizes pressing a button", async () => {
  const user = userEvent.setup();
  const setMuted = vi.fn();
  const onClick = vi.fn();
  render(
    <TestComponent setMicrophoneMuted={setMuted} onButtonClick={onClick} />,
  );

  await user.tab(); // Focus the button
  await user.keyboard("[Space]");
  expect(setMuted).not.toBeCalled();
  expect(onClick).toBeCalled();
});

test("unmuting happens in place of the default action", async () => {
  const user = userEvent.setup();
  const defaultPrevented = vi.fn();
  // In the real application, we mostly just want the spacebar shortcut to avoid
  // scrolling the page. But to test that here in JSDOM, we need some kind of
  // container element that can be interactive and receive focus / keydown
  // events. <video> is kind of a weird choice, but it'll do the job.
  render(
    <video
      tabIndex={0}
      onKeyDown={(e) => defaultPrevented(e.isDefaultPrevented())}
    >
      <TestComponent setMicrophoneMuted={() => {}} />
    </video>,
  );

  await user.tab(); // Focus the <video>
  await user.keyboard("[Space]");
  expect(defaultPrevented).toBeCalledWith(true);
});
