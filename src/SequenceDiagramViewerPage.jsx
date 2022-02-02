import React, { useCallback, useState } from "react";
import { SequenceDiagramViewer } from "./room/GroupCallInspector";
import { FieldRow, InputField } from "./input/Input";
import { usePageTitle } from "./usePageTitle";

export function SequenceDiagramViewerPage() {
  usePageTitle("Inspector");

  const [debugLog, setDebugLog] = useState();
  const [selectedUserId, setSelectedUserId] = useState();
  const onChangeDebugLog = useCallback((e) => {
    if (e.target.files && e.target.files.length > 0) {
      e.target.files[0].text().then((text) => {
        setDebugLog(JSON.parse(text));
      });
    }
  }, []);

  return (
    <div style={{ marginTop: 20 }}>
      <FieldRow>
        <InputField
          type="file"
          id="debugLog"
          name="debugLog"
          label="Debug Log"
          onChange={onChangeDebugLog}
        />
      </FieldRow>
      {debugLog && (
        <SequenceDiagramViewer
          localUserId={debugLog.localUserId}
          selectedUserId={selectedUserId}
          onSelectUserId={setSelectedUserId}
          remoteUserIds={debugLog.remoteUserIds}
          events={debugLog.eventsByUserId[selectedUserId]}
        />
      )}
    </div>
  );
}
