# Testing Element-Call in widget mode

When running `yarn backend` the latest element-web develop will be deployed and served on `http://localhost:8081`.
In a development environment, you might prefer to just use the `element-web` repo directly, but this setup is useful for CI/CD testing.

## Setup

The element-web configuration is modified to:

- Enable to use the local widget instance (`element_call.url` https://localhost:3000).
- Enable the labs features (`feature_group_calls`, `feature_element_call_video_rooms`).

The default configuration used by docker-compose is in `test-container/config.json`. There is a fixture for playwright
that uses

## Running the element-web instance

It is part of the existing backend setup. To start the backend, run:

```sh
yarn backend
```

Then open `http://localhost:8081` in your browser.

## Basic fixture

A base fixture is provided in `/playwright/fixtures/widget-user.ts` that will register two users that shares a room.
