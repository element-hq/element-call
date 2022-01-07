import React from "react";
import { Headline, Title, Subtitle, Body, Caption, Micro } from "./Typography";

export default {
  title: "Typography",
  parameters: {
    layout: "fullscreen",
  },
};

export const Typography = () => (
  <>
    <Headline>Headline Semi Bold</Headline>
    <Title>Title</Title>
    <Subtitle>Subtitle</Subtitle>
    <Subtitle fontWeight="semiBold">Subtitle Semi Bold</Subtitle>
    <Body>Body</Body>
    <Body fontWeight="semiBold">Body Semi Bold</Body>
    <Caption>Caption</Caption>
    <Caption fontWeight="semiBold">Caption Semi Bold</Caption>
    <Caption fontWeight="bold">Caption Bold</Caption>
    <Micro>Micro</Micro>
    <Micro fontWeight="bold">Micro bold</Micro>
  </>
);
