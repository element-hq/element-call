/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Popover } from "./Popover";
import { Button } from "@vector-im/compound-web";
import { VideoCallOffSolidIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { useState } from "react";

const meta = {
  component: Popover,
} satisfies Meta<typeof Popover>;

export default meta;

export const Default: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <Popover
        title="Poor network connection"
        trigger={<Button>Open popover</Button>}
        open={open}
        onOpenChange={setOpen}
      >
        <p>Turn off all videos to improve call performance.</p>
        <Button
          size="md"
          Icon={VideoCallOffSolidIcon}
          style={{ width: "100%", marginBlockStart: 24 }}
        >
          Turn off all videos
        </Button>
      </Popover>
    );
  },
};
