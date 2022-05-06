/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import React from "react";
import styles from "./CallEndedView.module.css";
import { LinkButton } from "../button";
import { useProfile } from "../profile/useProfile";
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
