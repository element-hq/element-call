/*
Copyright 2023 New Vector Ltd

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
import { Attributes } from "@opentelemetry/api";
import { VoipEvent } from "matrix-js-sdk/src/webrtc/call";
import { GroupCallStatsReport } from "matrix-js-sdk/src/webrtc/groupCall";
import {
  ByteSentStatsReport,
  ConnectionStatsReport,
  SummaryStatsReport,
} from "matrix-js-sdk/src/webrtc/stats/statsReport";

export class ObjectFlattener {
  public static flattenReportObject(
    prefix: string,
    report: ConnectionStatsReport | ByteSentStatsReport,
  ): Attributes {
    const flatObject = {};
    ObjectFlattener.flattenObjectRecursive(report, flatObject, `${prefix}.`, 0);
    return flatObject;
  }

  public static flattenByteSentStatsReportObject(
    statsReport: GroupCallStatsReport<ByteSentStatsReport>,
  ): Attributes {
    const flatObject = {};
    ObjectFlattener.flattenObjectRecursive(
      statsReport.report,
      flatObject,
      "matrix.stats.bytesSent.",
      0,
    );
    return flatObject;
  }

  public static flattenSummaryStatsReportObject(
    statsReport: GroupCallStatsReport<SummaryStatsReport>,
  ): Attributes {
    const flatObject = {};
    ObjectFlattener.flattenObjectRecursive(
      statsReport.report,
      flatObject,
      "matrix.stats.summary.",
      0,
    );
    return flatObject;
  }

  /* Flattens out an object into a single layer with components
   * of the key separated by dots
   */
  public static flattenVoipEvent(event: VoipEvent): Attributes {
    const flatObject = {};
    ObjectFlattener.flattenObjectRecursive(
      event as unknown as Record<string, unknown>, // XXX Types
      flatObject,
      "matrix.event.",
      0,
    );

    return flatObject;
  }

  public static flattenObjectRecursive(
    obj: object,
    flatObject: Attributes,
    prefix: string,
    depth: number,
  ): void {
    if (depth > 10)
      throw new Error(
        "Depth limit exceeded: aborting VoipEvent recursion. Prefix is " +
          prefix,
      );
    let entries;
    if (obj instanceof Map) {
      entries = obj.entries();
    } else {
      entries = Object.entries(obj);
    }
    for (const [k, v] of entries) {
      if (["string", "number", "boolean"].includes(typeof v) || v === null) {
        let value;
        value = v === null ? "null" : v;
        value = typeof v === "number" && Number.isNaN(v) ? "NaN" : value;
        flatObject[prefix + k] = value;
      } else if (typeof v === "object") {
        ObjectFlattener.flattenObjectRecursive(
          v,
          flatObject,
          prefix + k + ".",
          depth + 1,
        );
      }
    }
  }
}
