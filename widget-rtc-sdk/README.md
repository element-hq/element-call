# Widget RTC SDK

A single JavaScript bundle for widget pages: it connects to the host (for
example Element Web) over the widget API and wraps the `sdk/` package
(`@element-hq/matrixrtc-sdk`) to join a MatrixRTC slot and exchange realtime
data. A widget needs no Matrix login of its own: the host's client does the
talking. It uses nothing of Element Call's app; a page that is not a widget
uses the `sdk/` package directly (see `sdk/README.md`).

```ts
import { createMatrixRTCSdk } from "<bundle url>/widget-rtc-sdk.js";

const sdk = await createMatrixRTCSdk("com.example.my-app"); // the rtc application
sdk.join();
sdk.connected$.subscribe((connected) => console.info({ connected }));
sdk.remoteMembers$.subscribe((members) => console.info(members));
sdk.data$.subscribe(({ rtcBackendIdentity, data }) =>
  console.info(rtcBackendIdentity, JSON.parse(data)),
);
await sdk.sendData({ hello: "world" });
sdk.leave();
```

`createMatrixRTCSdk(application = "m.call", id = "", sticky = false)` takes the
slot's application and id, and whether to ask the host to keep the widget on
screen while joined. The participation publishes no media; `sendData` and
`data$` carry JSON over the `matrixRTC` data channel topic. When the
participation has left, the widget asks the host to close it.

If the widget page has a `config.json` beside it, the bundle reads Element
Call's `matrix_rtc_mode`, `livekit.livekit_service_url`,
`sync_disconnect_grace_period_ms` and `matrix_rtc_session` from it.

## Using a pull request's build

CI builds the bundle for every pull request and deploys it to Netlify as
`pr<N>-widget-rtc-sdk`, so a widget can import it without building anything:

```
https://pr<N>-widget-rtc-sdk--element-call.netlify.app/widget-rtc-sdk.js
```

1. Host a page that imports it. `index.html` in this folder is one: set the
   PR number in its import and serve the folder, for example with
   `npx serve -l 8080`.
2. Add the page as a widget in a room in Element Web (see
   [Widget url](#widget-url)):

   ```
   /addwidget http://localhost:8080?widgetId=$matrix_widget_id&userId=$matrix_user_id&deviceId=$org.matrix.msc3819.matrix_device_id&baseUrl=$org.matrix.msc4039.matrix_base_url&roomId=$matrix_room_id
   ```

3. Open the widget, approve the capabilities it asks for and allow it to
   verify your identity, ticking "Remember this": it asks for an OpenID token
   more than once. The example joins on load. Open it from a second account to see members and
   data arrive.

## Building it yourself

```
pnpm install
pnpm build:widget-rtc-sdk
```

in the repository root writes the bundle to `dist/`, entry `widget-rtc-sdk.js`.
Serve it with CORS, so a page on another origin can import it (for example
`npx serve -l 8123 --cors dist`), and point the page's import at
`http://localhost:8123/widget-rtc-sdk.js`.

`build:widget-rtc-sdk:production` (what CI deploys) minifies and leaves out
source maps; `build:widget-rtc-sdk:development` does neither.

## Widget url

The host fills the widget url's parameters in when it opens the widget; the
bundle reads them, from the query or from a query in the fragment, to start the
widget API:

```
widgetId = $matrix_widget_id
userId = $matrix_user_id
deviceId = $org.matrix.msc3819.matrix_device_id
baseUrl = $org.matrix.msc4039.matrix_base_url
roomId = $matrix_room_id
```

`parentUrl` is added by the host. `sendNotificationType` (`ring` or
`notification`) optionally notifies the room on join.

The `$` prefixed variables are replaced by Element Web when it opens the widget
(for example `$matrix_user_id` becomes `@user:example.com`, url encoded as
`%40user%3Aexample.com`).
