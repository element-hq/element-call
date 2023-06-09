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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  return (
    <div className={styles.starRating}>
      {[...Array(starCount)].map((_star, index) => {
        index += 1;
        return (
          <div
            className={styles.inputContainer}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(rating)}
            key={index}
          >
            <input
              className={styles.hideElement}
              type="radio"
              id={"starInput" + String(index)}
              value={String(index) + "Star"}
              name="star rating"
              onChange={(_ev) => {
                setRating(index);
                onChange(index);
              }}
              required
            />
            <label
              className={styles.hideElement}
              id={"starInvisibleLabel" + String(index)}
              htmlFor={"starInput" + String(index)}
            >
              {t("{{count}} stars", {
                count: index,
              })}
            </label>
            <label
              className={styles.starIcon}
              id={"starIcon" + String(index)}
              htmlFor={"starInput" + String(index)}
            >
              {index <= (hover || rating) ? (
                <StarSelected />
              ) : (
                <StarUnselected />
              )}
            </label>
          </div>
        );
      })}
    </div>
  );
}
