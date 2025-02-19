/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";

import styles from "./StarRatingInput.module.css";
import StarSelected from "../icons/StarSelected.svg?react";
import StarUnselected from "../icons/StarUnselected.svg?react";

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
            onMouseEnter={(): void => setHover(index)}
            onMouseLeave={(): void => setHover(rating)}
            key={index}
          >
            <input
              className={styles.hideElement}
              type="radio"
              id={"starInput" + String(index)}
              value={String(index) + "Star"}
              name="star rating"
              onChange={(_ev): void => {
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
              {t("star_rating_input_label", {
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
