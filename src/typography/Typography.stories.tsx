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

import React from "react";

import { Headline, Title, Subtitle, Body, Caption, Micro } from "./Typography";

export default {
  title: "Typography",
  parameters: {
    layout: "fullscreen",
  },
};

export const Typography: React.FC<{}> = () => (
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
