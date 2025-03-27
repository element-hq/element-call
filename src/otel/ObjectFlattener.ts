/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import { type Attributes } from "@opentelemetry/api";
import { type VoipEvent } from "matrix-js-sdk/lib/webrtc/call";
import { type GroupCallStatsReport } from "matrix-js-sdk/lib/webrtc/groupCall";
import {
  type ByteSentStatsReport,
  type ConnectionStatsReport,
  type SummaryStatsReport,
} from "matrix-js-sdk/lib/webrtc/stats/statsReport";

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
