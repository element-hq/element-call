import React from "react";
import styles from "./CallEndedView.module.css";
import { LinkButton } from "../button";
import { useProfile } from "../ConferenceCallManagerHooks";
import { Subtitle, Body, Link, Headline } from "../typography/Typography";
import { Header, HeaderLogo, LeftNav, RightNav } from "../Header";

export function CallEndedView({ client }) {
  const { displayName } = useProfile(client);

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
            {displayName}, your call is now ended
          </Headline>
          <div className={styles.callEndedContent}>
            <Subtitle>
              Why not finish by setting up a password to keep your account?
            </Subtitle>
            <Subtitle>
              You'll be able to keep your name and set an avatar for use on
              future calls
            </Subtitle>
            <LinkButton
              className={styles.callEndedButton}
              size="lg"
              variant="default"
              to="/register"
            >
              Create account
            </LinkButton>
          </div>
        </main>
        <Body className={styles.footer}>
          <Link color="primary" to="/">
            Not now, return to home screen
          </Link>
        </Body>
      </div>
    </>
  );
}
