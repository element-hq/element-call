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

import { expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { TooltipProvider } from "@vector-im/compound-web";

import { RoomHeaderInfo } from "./Header";

global.matchMedia = vi.fn().mockReturnValue({
  matches: true,
  addEventListener: () => {},
  removeEventListener: () => {},
});

test("RoomHeaderInfo works", async () => {
  const { container } = render(
    <TooltipProvider>
      <RoomHeaderInfo
        id="!a:example.org"
        name="Mission Control"
        avatarUrl=""
        encrypted
        participantCount={11}
      />
    </TooltipProvider>,
  );
  expect(await axe(container)).toHaveNoViolations();
});
