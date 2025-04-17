/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type RelationType } from "matrix-js-sdk";

import catSoundOgg from "../sound/reactions/cat.ogg?url";
import catSoundMp3 from "../sound/reactions/cat.mp3?url";
import clapSoundOgg from "../sound/reactions/clap.ogg?url";
import clapSoundMp3 from "../sound/reactions/clap.mp3?url";
import cricketsSoundOgg from "../sound/reactions/crickets.ogg?url";
import cricketsSoundMp3 from "../sound/reactions/crickets.mp3?url";
import dogSoundOgg from "../sound/reactions/dog.ogg?url";
import dogSoundMp3 from "../sound/reactions/dog.mp3?url";
import genericSoundOgg from "../sound/reactions/generic.ogg?url";
import genericSoundMp3 from "../sound/reactions/generic.mp3?url";
import lightbulbSoundOgg from "../sound/reactions/lightbulb.ogg?url";
import lightbulbSoundMp3 from "../sound/reactions/lightbulb.mp3?url";
import partySoundOgg from "../sound/reactions/party.ogg?url";
import partySoundMp3 from "../sound/reactions/party.mp3?url";
import deerSoundOgg from "../sound/reactions/deer.ogg?url";
import deerSoundMp3 from "../sound/reactions/deer.mp3?url";
import rockSoundOgg from "../sound/reactions/rock.ogg?url";
import rockSoundMp3 from "../sound/reactions/rock.mp3?url";
import waveSoundOgg from "../sound/reactions/wave.ogg?url";
import waveSoundMp3 from "../sound/reactions/wave.mp3?url";
import baduntssSoundOgg from "../sound/reactions/baduntss.ogg?url";
import baduntssSoundMp3 from "../sound/reactions/baduntss.mp3?url";

export const ElementCallReactionEventType = "io.element.call.reaction";

export interface ReactionOption {
  /**
   * The emoji to display. This is always displayed even if no emoji is matched
   * from `ReactionSet`.
   *
   * @note Any excess characters are trimmed from this string.
   */
  emoji: string;
  /**
   * The name of the emoji. This is the unique key used when looking for a local
   * effect in our `ReactionSet` array.
   */
  name: string;
  /**
   * Optional aliases to look for when searching for an emoji in the interface.
   */
  alias?: string[];
  /**
   * Optional sound to play. An ogg sound must always be provided.
   * If this sound isn't given, `GenericReaction` is used.
   */
  sound?: {
    mp3?: string;
    ogg: string;
  };
}

export interface ECallReactionEventContent {
  "m.relates_to": {
    rel_type: RelationType.Reference;
    event_id: string;
  };
  emoji: string;
  name: string;
}

export const GenericReaction: ReactionOption = {
  name: "generic",
  emoji: "", // Filled in by user
  sound: {
    mp3: genericSoundMp3,
    ogg: genericSoundOgg,
  },
};

export const ReactionsRowSize = 5;

// The first {ReactionsRowSize} reactions are always visible.
export const ReactionSet: ReactionOption[] = [
  {
    emoji: "👍",
    name: "thumbsup",
    // TODO: These need to be translated.
    alias: ["+1", "yes", "thumbs up"],
  },
  {
    emoji: "🎉",
    name: "party",
    alias: ["hurray", "success"],
    sound: {
      ogg: partySoundOgg,
      mp3: partySoundMp3,
    },
  },
  {
    emoji: "👏",
    name: "clapping",
    alias: ["celebrate", "success"],
    sound: {
      ogg: clapSoundOgg,
      mp3: clapSoundMp3,
    },
  },
  {
    emoji: "🐶",
    name: "dog",
    alias: ["doggo", "pupper", "woofer", "bark"],
    sound: {
      ogg: dogSoundOgg,
      mp3: dogSoundMp3,
    },
  },
  {
    emoji: "🐱",
    name: "cat",
    alias: ["meow", "kitty"],
    sound: {
      ogg: catSoundOgg,
      mp3: catSoundMp3,
    },
  },
  {
    emoji: "💡",
    name: "lightbulb",
    alias: ["bulb", "light", "idea", "ping"],
    sound: {
      ogg: lightbulbSoundOgg,
      mp3: lightbulbSoundMp3,
    },
  },
  {
    emoji: "🦗",
    name: "crickets",
    alias: ["awkward", "silence"],
    sound: {
      ogg: cricketsSoundOgg,
      mp3: cricketsSoundMp3,
    },
  },
  {
    emoji: "👎",
    name: "thumbsdown",
    alias: ["-1", "no", "thumbs no"],
  },
  {
    emoji: "😵‍💫",
    name: "dizzy",
    alias: ["dazed", "confused"],
  },
  {
    emoji: "👌",
    name: "ok",
    alias: ["okay", "cool"],
  },
  {
    emoji: "🥰",
    name: "heart",
    alias: ["heart", "love", "smiling"],
  },
  {
    emoji: "😄",
    name: "laugh",
    alias: ["giggle", "joy", "smiling"],
  },
  {
    emoji: "🦌",
    name: "deer",
    alias: ["stag", "doe", "bleat"],
    sound: {
      ogg: deerSoundOgg,
      mp3: deerSoundMp3,
    },
  },
  {
    emoji: "🤘",
    name: "rock",
    alias: ["cool", "horns", "guitar"],
    sound: {
      ogg: rockSoundOgg,
      mp3: rockSoundMp3,
    },
  },
  {
    emoji: "👋",
    name: "wave",
    alias: ["hand", "waving"],
    sound: {
      ogg: waveSoundOgg,
      mp3: waveSoundMp3,
    },
  },
  {
    emoji: "🥁",
    name: "drum",
    alias: ["joke"],
    sound: {
      ogg: baduntssSoundOgg,
      mp3: baduntssSoundMp3,
    },
  },
];

export interface RaisedHandInfo {
  /**
   * Call membership event that was reacted to.
   */
  membershipEventId: string;
  /**
   * Event ID of the reaction itself.
   */
  reactionEventId: string;
  /**
   * The time when the reaction was raised.
   */
  time: Date;
}

export interface ReactionInfo {
  expireAfter: Date;
  reactionOption: ReactionOption;
}
