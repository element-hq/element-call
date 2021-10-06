/*
Copyright 2021 New Vector Ltd

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

import React, { useState, useEffect } from "react";
import styles from "./GuestAuthPage.module.css";
import { useLocation, useHistory } from "react-router-dom";
import { Header, LeftNav } from "./Header";
import { Center, Content, Modal } from "./Layout";
import { ErrorModal } from "./ErrorModal";

export function GuestAuthPage({ onLoginAsGuest }) {
  const history = useHistory();
  const location = useLocation();
  const [error, setError] = useState();

  useEffect(() => {
    onLoginAsGuest("Guest " + Math.round(Math.random() * 999)).catch(setError);
  }, [onLoginAsGuest, location, history]);

  return (
    <div className={styles.guestAuthPage}>
      <Header>
        <LeftNav />
      </Header>
      <Content>
        <Center>
          <Modal>
            {error ? <ErrorModal error={error} /> : <div>Loading...</div>}
          </Modal>
        </Center>
      </Content>
    </div>
  );
}
