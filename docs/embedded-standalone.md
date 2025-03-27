## Element Call packages

Element Call is available as two different packages: Full Package and Embedded Package. The Full Package is designed for standalone use, while the Embedded Package is designed for widget mode only. The table below provides a comparison of the two packages:

|                                | Full Package                                                             | Embedded Package                                        |
| ------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| **Supports use as standalone** | ✅                                                                       | ❌                                                      |
| **Supports use as widget**     | ✅                                                                       | ✅                                                      |
| **Deployment mode**            | Hosted as a static web page and accessed via a URL when used as a widget | Bundled within a messenger app for seamless integration |
| **Release artifacts**          | Docker Image, Tarball                                                    | Tarball, NPM for Web, Android AAR, SwiftPM for iOS      |
| **Recommended for**            | Standalone/guest access usage                                            | Embedding within messenger apps                         |

For examples of how to use the platform specific release artifacts (e.g. Android AAR) see
the Element Messenger apps for: [Web](https://github.com/element-hq/element-web), [iOS](https://github.com/element-hq/element-x-ios) and [Android](https://github.com/element-hq/element-x-android).

## Widget vs standalone mode

Element Call is developed using the [js-sdk](https://github.com/matrix-org/matrix-js-sdk) with matroska mode. This means the app can run either as a standalone app directly connected to a homeserver providing login interfaces or it can be used as a widget within a Matrix client.

As a widget, the app only uses the core calling (MatrixRTC) parts. The rest (authentication, sending events, getting room state updates about calls) is done by the hosting client.
Element Call and the hosting client are connected via the widget API.

Element Call detects that it is run as a widget if a widgetId is defined in the url parameters. If `widgetId` is present then Element Call will try to connect to the client via the widget postMessage API using the parameters provided in [Url Format and parameters
](./url-params.md).
