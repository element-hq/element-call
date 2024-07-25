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

import { FC, FormEventHandler, ReactNode, useCallback, useState } from "react";
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
import { RageshakeButton } from "../settings/RageshakeButton";

interface Props {
  client: MatrixClient;
  isPasswordlessUser: boolean;
  confineToRoom: boolean;
  endedCallId: string;
  leaveError?: Error;
  reconnect: () => void;
}

export const CallEndedView: FC<Props> = ({
  client,
  isPasswordlessUser,
  confineToRoom,
  endedCallId,
  leaveError,
  reconnect,
}) => {
  const { t } = useTranslation();
  const history = useHistory();

  const { displayName } = useProfile(client);
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const [starRating, setStarRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const submitSurvey: FormEventHandler<HTMLFormElement> = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target as HTMLFormElement);
      const feedbackText = data.get("feedbackText") as string;

      PosthogAnalytics.instance.eventQualitySurvey.track(
        endedCallId,
        feedbackText,
        starRating,
      );

      setSubmitting(true);

      setTimeout(() => {
        setSubmitDone(true);

        setTimeout(() => {
          if (isPasswordlessUser) {
            // setting this renders the callEndedView with the invitation to create an account
            setSurveySubmitted(true);
          } else if (!confineToRoom) {
            // if the user already has an account immediately go back to the home screen
            history.push("/");
          }
        }, 1000);
      }, 1000);
    },
    [endedCallId, history, isPasswordlessUser, confineToRoom, starRating],
  );

  const createAccountDialog = isPasswordlessUser && (
    <div className={styles.callEndedContent}>
      <Trans i18nKey="call_ended_view.create_account_prompt">
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
        {t("call_ended_view.create_account_button")}
      </LinkButton>
    </div>
  );

  const qualitySurveyDialog = (
    <div className={styles.callEndedContent}>
      <Trans i18nKey="call_ended_view.feedback_prompt">
        <p>
          We'd love to hear your feedback so we can improve your experience.
        </p>
      </Trans>
      <form onSubmit={submitSurvey}>
        <FieldRow>
          <StarRatingInput starCount={5} onChange={setStarRating} required />
        </FieldRow>
        <FieldRow>
          <InputField
            className={feedbackStyle.feedback}
            id="feedbackText"
            name="feedbackText"
            label={t("settings.feedback_tab_description_label")}
            placeholder={t("settings.feedback_tab_description_label")}
            type="textarea"
          />
        </FieldRow>{" "}
        <FieldRow>
          {submitDone ? (
            <Trans i18nKey="call_ended_view.feedback_done">
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
              {submitting ? t("submitting") : t("action.submit")}
            </Button>
          )}
        </FieldRow>
      </form>
    </div>
  );

  const renderBody = (): ReactNode => {
    if (leaveError) {
      return (
        <>
          <main className={styles.main}>
            <Headline className={styles.headline}>
              <Trans i18nKey="call_ended_view.body">
                You were disconnected from the call
              </Trans>
            </Headline>
            <div className={styles.disconnectedButtons}>
              <Button size="lg" variant="default" onClick={reconnect}>
                {t("call_ended_view.reconnect_button")}
              </Button>
              <div className={styles.rageshakeButton}>
                <RageshakeButton description="***Call disconnected***" />
              </div>
            </div>
          </main>
          {!confineToRoom && (
            <Body className={styles.footer}>
              <Link color="primary" to="/">
                {t("return_home_button")}
              </Link>
            </Body>
          )}
        </>
      );
    } else {
      return (
        <>
          <main className={styles.main}>
            <Headline className={styles.headline}>
              {surveySubmitted
                ? t("call_ended_view.headline", {
                    displayName,
                  })
                : t("call_ended_view.headline", {
                    displayName,
                  }) +
                  "\n" +
                  t("call_ended_view.survey_prompt")}
            </Headline>
            {(!surveySubmitted || confineToRoom) &&
            PosthogAnalytics.instance.isEnabled()
              ? qualitySurveyDialog
              : createAccountDialog}
          </main>
          {!confineToRoom && (
            <Body className={styles.footer}>
              <Link color="primary" to="/">
                {t("call_ended_view.not_now_button")}
              </Link>
            </Body>
          )}
        </>
      );
    }
  };

  return (
    <>
      <Header>
        <LeftNav>{!confineToRoom && <HeaderLogo />}</LeftNav>
        <RightNav />
      </Header>
      <div className={styles.container}>{renderBody()}</div>
    </>
  );
};
