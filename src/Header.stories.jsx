import React from "react";
import { Header, LeftNav, RightNav } from "./Header";

export default {
  title: "Header",
  component: Header,
};

export const Home = () => (
  <Header>
    <LeftNav></LeftNav>
    <RightNav></RightNav>
  </Header>
);
