## Element Call packages

Element Call is available as two different packages: Full Package and Embedded Package.

The Full Package is designed for standalone use, while the Embedded Package is designed for widget mode only.

The table below provides a comparison of the two packages:

|                                              | Full Package                                                                                                                      | Embedded Package                                                                                                                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supports use as standalone**               | ✅                                                                                                                                | ❌                                                                                                                                                                                                                  |
| **Supports use as widget**                   | ✅                                                                                                                                | ✅                                                                                                                                                                                                                  |
| **Deployment mode**                          | Hosted as a static web page and accessed via a URL when used as a widget                                                          | Bundled within a messenger app for seamless integration                                                                                                                                                             |
| **Release artifacts**                        | Docker Image, Tarball                                                                                                             | Tarball, NPM for Web, Android AAR, SwiftPM for iOS                                                                                                                                                                  |
| **Recommended for**                          | Standalone/guest access usage                                                                                                     | Embedding within messenger apps                                                                                                                                                                                     |
| **Responsibility for regulatory compliance** | The administrator that is deploying the app is responsible for compliance with any applicable regulations (e.g. privacy)          | The developer of the messenger app is responsible for compliance                                                                                                                                                    |
| **Analytics consent**                        | Element Call will show a consent UI.                                                                                              | Element Call will not show a consent UI. The messenger app should only provide the embedded Element Call with the [analytics URL parameters](./url-params.md#embedded-only-parameters) if consent has been granted. |
| **Analytics data**                           | Element Call will send data to the Posthog, Sentry and Open Telemetry targets specified by the administrator in the `config.json` | Element Call will send data to the Posthog and Sentry targets specified in the URL parameters by the messenger app                                                                                                  |

### Using the embedded package within a messenger app

Currently the best way to understand the necessary steps is to look at the implementations in the Element Messenger apps: [Web](https://github.com/element-hq/element-web/pull/29309), [iOS](https://github.com/element-hq/element-x-ios/pull/3939) and [Android](https://github.com/element-hq/element-x-android/pull/4470).

The basics are:

1. Add the appropriate platform dependency as given for a [release](https://github.com/element-hq/element-call/releases), or use the embedded tarball. e.g. `npm install @element-hq/element-call-embedded@0.9.0`
2. Include the assets from the platform dependency in the build process. e.g. copy the assets during a [Webpack](https://github.com/element-hq/element-web/blob/247cd8d56d832d006d7dfb919d1042529d712b59/webpack.config.js#L677-L682) build.
3. Use the `index.html` entrypointof the imported assets when you are constructing the WebView or iframe. e.g. using a [relative path in a webapp](https://github.com/element-hq/element-web/blob/247cd8d56d832d006d7dfb919d1042529d712b59/src/models/Call.ts#L680), or on the the Android [WebViewAssetLoader](https://github.com/element-hq/element-x-android/blob/fe5aab6588ecdcf9354a3bfbd9e97c1b31175a8f/features/call/impl/src/main/kotlin/io/element/android/features/call/impl/utils/DefaultCallWidgetProvider.kt#L20)
4. Set any of the [embedded-only URL parameters](./url-params.md#embedded-only-parameters) that you need.

## Widget vs standalone mode

Element Call is developed using the [js-sdk](https://github.com/matrix-org/matrix-js-sdk) with matroska mode. This means the app can run either as a standalone app directly connected to a homeserver providing login interfaces or it can be used as a widget within a Matrix client.

As a widget, the app only uses the core calling (MatrixRTC) parts. The rest (authentication, sending events, getting room state updates about calls) is done by the hosting client.
Element Call and the hosting client are connected via the widget API.

Element Call detects that it is run as a widget if a widgetId is defined in the url parameters. If `widgetId` is present then Element Call will try to connect to the client via the widget postMessage API using the parameters provided in [Url Format and parameters
](./url-params.md).
