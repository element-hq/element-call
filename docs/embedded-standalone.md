## Embedded vs standalone mode

Element call is developed using the js-sdk with matroska mode. This means the app can run either as a standalone app directly connected to a homeserver providing login interfaces or it can be used as a widget.

As a widget the app only uses the core calling (matrixRTC) parts. The rest (authentication, sending events, getting room state updates about calls) is done by the hosting client.
Element Call and the hosting client are connected via the widget api.

Element call detects that it is run as a widget if a widgetId is defined in the url parameters. If `widgetId` is present element call will try to connect to the client via the widget postMessage api using the parameters provided in [Url Format and parameters
](./url-params.md).
