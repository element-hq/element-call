/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  type FormEventHandler,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { type MatrixClient } from "matrix-js-sdk/src/client";
import { Trans, useTranslation } from "react-i18next";
import { Button, Heading, Text } from "@vector-im/compound-web";
import { OfflineIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { useNavigate } from "react-router-dom";
import { logger } from "matrix-js-sdk/src/logger";

import styles from "./CallEndedView.module.css";
import feedbackStyle from "../input/FeedbackInput.module.css";
import { useProfile } from "../profile/useProfile";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { FieldRow, InputField } from "../input/Input";
import { StarRatingInput } from "../input/StarRatingInput";
import { Link } from "../button/Link";
import { LinkButton } from "../button";
import { ErrorView } from "../ErrorView";

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
  const navigate = useNavigate();

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
            navigate("/")?.catch((error) => {
              logger.error("Failed to navigate to /", error);
            });
          }
        }, 1000);
      }, 1000);
    },
    [endedCallId, navigate, isPasswordlessUser, confineToRoom, starRating],
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
      <LinkButton className={styles.callEndedButton} to="/register">
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
            <ErrorView
              Icon={OfflineIcon}
              title={t("error.connection_lost")}
              rageshake
            >
              <p>{t("error.connection_lost_description")}</p>
              <Button onClick={reconnect}>
                {t("call_ended_view.reconnect_button")}
              </Button>
            </ErrorView>
          </main>
        </>
      );
    } else {
      return (
        <>
          <main className={styles.main}>
            <Heading size="xl" weight="semibold" className={styles.headline}>
              {surveySubmitted
                ? t("call_ended_view.headline", {
                    displayName,
                  })
                : t("call_ended_view.headline", {
                    displayName,
                  }) +
                  "\n" +
                  t("call_ended_view.survey_prompt")}
            </Heading>
            {(!surveySubmitted || confineToRoom) &&
            PosthogAnalytics.instance.isEnabled()
              ? qualitySurveyDialog
              : createAccountDialog}
          </main>
          {!confineToRoom && (
            <Text className={styles.footer}>
              <Link to="/"> {t("call_ended_view.not_now_button")} </Link>
            </Text>
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
