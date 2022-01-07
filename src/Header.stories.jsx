import React from "react";
import { GridLayoutMenu } from "./GridLayoutMenu";
import {
  Header,
  HeaderLogo,
  LeftNav,
  RightNav,
  RoomHeaderInfo,
} from "./Header";
import { UserMenu } from "./UserMenu";

export default {
  title: "Header",
  component: Header,
  parameters: {
    layout: "fullscreen",
  },
};

export const HomeAnonymous = () => (
  <Header>
    <LeftNav>
      <HeaderLogo />
    </LeftNav>
    <RightNav>
      <UserMenu />
    </RightNav>
  </Header>
);

export const HomeNamedGuest = () => (
  <Header>
    <LeftNav>
      <HeaderLogo />
    </LeftNav>
    <RightNav>
      <UserMenu isAuthenticated isPasswordlessUser displayName="Yara" />
    </RightNav>
  </Header>
);

export const HomeLoggedIn = () => (
  <Header>
    <LeftNav>
      <HeaderLogo />
    </LeftNav>
    <RightNav>
      <UserMenu isAuthenticated displayName="Yara" />
    </RightNav>
  </Header>
);

export const LobbyNamedGuest = () => (
  <Header>
    <LeftNav>
      <RoomHeaderInfo roomName="Q4Roadmap" />
    </LeftNav>
    <RightNav>
      <UserMenu isAuthenticated isPasswordlessUser displayName="Yara" />
    </RightNav>
  </Header>
);

export const LobbyLoggedIn = () => (
  <Header>
    <LeftNav>
      <RoomHeaderInfo roomName="Q4Roadmap" />
    </LeftNav>
    <RightNav>
      <UserMenu isAuthenticated displayName="Yara" />
    </RightNav>
  </Header>
);

export const InRoomNamedGuest = () => (
  <Header>
    <LeftNav>
      <RoomHeaderInfo roomName="Q4Roadmap" />
    </LeftNav>
    <RightNav>
      <GridLayoutMenu layout="freedom" />
      <UserMenu isAuthenticated isPasswordlessUser displayName="Yara" />
    </RightNav>
  </Header>
);

export const InRoomLoggedIn = () => (
  <Header>
    <LeftNav>
      <RoomHeaderInfo roomName="Q4Roadmap" />
    </LeftNav>
    <RightNav>
      <GridLayoutMenu layout="freedom" />
      <UserMenu isAuthenticated displayName="Yara" />
    </RightNav>
  </Header>
);

export const CreateAccount = () => (
  <Header>
    <LeftNav>
      <HeaderLogo />
    </LeftNav>
    <RightNav></RightNav>
  </Header>
);
