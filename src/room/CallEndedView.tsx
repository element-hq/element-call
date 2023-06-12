/*
Copyright 2022 New Vector Ltd

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

import React, { FormEventHandler, useCallback, useState } from "react";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { Trans, useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";

import styles from "./CallEndedView.module.css";
import feedbackStyle from "../input/FeedbackInput.module.css";
import { Button, LinkButton } from "../button";
import { useProfile } from "../profile/useProfile";
import { Body, Link, Headline } from "../typography/Typography";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { FieldRow, InputField } from "../input/Input";
import { StarRatingInput } from "../input/StarRatingInput";

export function CallEndedView({
  client,
  isPasswordlessUser,
  endedCallId,
}: {
  client: MatrixClient;
  isPasswordlessUser: boolean;
  endedCallId: string;
}) {
  const { t } = useTranslation();
  const history = useHistory();

  const { displayName } = useProfile(client);
  const [surveySubmitted, setSurverySubmitted] = useState(false);
  const [starRating, setStarRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const submitSurvery: FormEventHandler<HTMLFormElement> = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target as HTMLFormElement);
      const feedbackText = data.get("feedbackText") as string;

      PosthogAnalytics.instance.eventQualitySurvey.track(
        endedCallId,
        feedbackText,
        starRating
      );

      setSubmitting(true);

      setTimeout(() => {
        setSubmitDone(true);

        setTimeout(() => {
          if (isPasswordlessUser) {
            // setting this renders the callEndedView with the invitation to create an account
            setSurverySubmitted(true);
          } else {
            // if the user already has an account immediately go back to the home screen
            history.push("/");
          }
        }, 1000);
      }, 1000);
    },
    [endedCallId, history, isPasswordlessUser, starRating]
  );
  const createAccountDialog = isPasswordlessUser && (
    <div className={styles.callEndedContent}>
      <Trans>
        <p>Why not finish by setting up a password to keep your account?</p>
        <p>
          You'll be able to keep your name and set an avatar for use on future
          calls
        </p>
      </Trans>
      <LinkButton
        className={styles.callEndedButton}
        size="lg"
        variant="default"
        to="/register"
      >
        {t("Create account")}
      </LinkButton>
    </div>
  );

  const qualitySurveyDialog = (
    <div className={styles.callEndedContent}>
      <Trans>
        <p>
          We'd love to hear your feedback so we can improve your experience.
        </p>
      </Trans>
      <form onSubmit={submitSurvery}>
        <FieldRow>
          <StarRatingInput starCount={5} onChange={setStarRating} required />
        </FieldRow>
        <FieldRow>
          <InputField
            className={feedbackStyle.feedback}
            id="feedbackText"
            name="feedbackText"
            label={t("Your feedback")}
            placeholder={t("Your feedback")}
            type="textarea"
          />
        </FieldRow>{" "}
        <FieldRow>
          {submitDone ? (
            <Trans>
              <p>Thanks for your feedback!</p>
            </Trans>
          ) : (
            <Button
              type="submit"
              className={styles.submitButton}
              size="lg"
              variant="default"
              data-testid="home_go"
            >
              {submitting ? t("Submitting…") : t("Submit")}
            </Button>
          )}
        </FieldRow>
      </form>
    </div>
  );

  return (
    <>
      <Header>
        <LeftNav>
          <HeaderLogo />
        </LeftNav>
        <RightNav />
      </Header>
      <div className={styles.container}>
        <main className={styles.main}>
          <Headline className={styles.headline}>
            {surveySubmitted
              ? t("{{displayName}}, your call has ended.", {
                  displayName,
                })
              : t("{{displayName}}, your call has ended.", {
                  displayName,
                }) +
                "\n" +
                t("How did it go?")}
          </Headline>
          {!surveySubmitted && PosthogAnalytics.instance.isEnabled()
            ? qualitySurveyDialog
            : createAccountDialog}
        </main>
        <Body className={styles.footer}>
          <Link color="primary" to="/">
            {t("Not now, return to home screen")}
          </Link>
        </Body>
      </div>
    </>
  );
}
