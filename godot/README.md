## url parameters
widgetId = $matrix_widget_id
perParticipantE2EE = true
userId = $matrix_user_id
deviceId = $org.matrix.msc3819.matrix_device_id
baseUrl = $org.matrix.msc4039.matrix_base_url

parentUrl = // will be inserted automatically

http://localhost?widgetId=&perParticipantE2EE=true&userId=&deviceId=&baseUrl=&roomId=

->

http://localhost:3000?widgetId=$matrix_widget_id&perParticipantE2EE=true&userId=$matrix_user_id&deviceId=$org.matrix.msc3819.matrix_device_id&baseUrl=$org.matrix.msc4039.matrix_base_url&roomId=$matrix_room_id
