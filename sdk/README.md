# SDK mode

EC can be build in sdk mode. This will result in a compiled js file that can be imported in very simple webapps.

It allows to use matrixRTC in combination with livekit without relying on element call.

This is done by instantiating the call view model and exposing some useful behaviors (observables) and methods.

This folder contains an example index.html file that showcases the sdk in use (hosted on localhost:8123 with a webserver ellowing cors (for example `npx serve -l 81234 --cors`)) as a godot engine HTML export template.

## Widgets

The sdk mode is particularly interesting to be used in widgets where you do not need to pay attention to matrix login/cs api ...
To create a widget see the example index.html file in this folder. And add it to EW via:
`/addwidget <widgetUrl>` (see **url parameters** for more details on `<widgetUrl>`)

### url parameters

```
widgetId = $matrix_widget_id
userId = $matrix_user_id
deviceId = $org.matrix.msc3819.matrix_device_id
baseUrl = $org.matrix.msc4039.matrix_base_url
```

`parentUrl = // will be inserted automatically`

Full template use as `<widgetUrl>`:

```
http://localhost:3000?widgetId=$matrix_widget_id&userId=$matrix_user_id&deviceId=$org.matrix.msc3819.matrix_device_id&baseUrl=$org.matrix.msc4039.matrix_base_url&roomId=$matrix_room_id
```

the `$` prefixed variables will be replaced by EW on widget instantiation. (e.g. `$matrix_user_id` -> `@user:example.com` (url encoding will also be applied automatically by EW) -> `%40user%3Aexample.com`)
