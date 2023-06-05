/*
Copyright 2023 New Vector Ltd

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
import React, { useState } from "react";

import styles from "./StarRatingInput.module.css";
import { ReactComponent as StarSelected } from "../icons/StarSelected.svg";
import { ReactComponent as StarUnselected } from "../icons/StarUnselected.svg";

interface Props {
  starCount: number;
  onChange: (stars: number) => void;
  required?: boolean;
}

export function StarRatingInput({
  starCount,
  onChange,
  required,
}: Props): JSX.Element {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  return (
    <div className={styles.starRating}>
      <input
        className={styles.fakeInputElement}
        id="numberInput"
        type="number"
        required={required && rating === 0}
      />
      {[...Array(starCount)].map((_star, index) => {
        index += 1;
        return (
          <button
            type="button"
            key={index}
            className={styles.star}
            onClick={() => {
              setRating(index);
              onChange(index);
            }}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(rating)}
          >
            <span className="star">
              {index <= (hover || rating) ? (
                <StarSelected />
              ) : (
                <StarUnselected />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
