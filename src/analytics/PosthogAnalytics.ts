/*
Copyright 2022 The New Vector Ltd

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

import posthog, { CaptureOptions, PostHog, Properties } from "posthog-js";
import { logger } from "matrix-js-sdk/src/logger";
import { MatrixClient } from "matrix-js-sdk";
import { Buffer } from "buffer";

import { widget } from "../widget";
import {
  CallEndedTracker,
  CallStartedTracker,
  LoginTracker,
  SignupTracker,
  MuteCameraTracker,
  MuteMicrophoneTracker,
  UndecryptableToDeviceEventTracker,
  QualitySurveyEventTracker,
  CallDisconnectedEventTracker,
  CallConnectDurationTracker,
} from "./PosthogEvents";
import { Config } from "../config/Config";
import { getUrlParams } from "../UrlParams";
import { optInAnalytics } from "../settings/settings";

/* Posthog analytics tracking.
 *
 * Anonymity behaviour is as follows:
 *
 * - If Posthog isn't configured in `config.json`, events are not sent.
 * - If [Do Not Track](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/doNotTrack) is
 *   enabled, events are not sent (this detection is built into posthog and turned on via the
 *   `respect_dnt` flag being passed to `posthog.init`).
 * - If the posthog analytics are explicitly activated by the user in the element call settings,
 *   a randomised analytics ID is created and stored in account_data for that user (shared between devices)
 *   so that the user can be identified in posthog.
 */

export interface IPosthogEvent {
  // The event name that will be used by PostHog. Event names should use camelCase.
  eventName: string;

  // do not allow these to be sent manually, we enqueue them all for caching purposes
  $set?: void;
  $set_once?: void;
}

export enum Anonymity {
  Disabled,
  Anonymous,
  Pseudonymous,
}

export enum RegistrationType {
  Guest,
  Registered,
}

interface PlatformProperties {
  appVersion: string;
  matrixBackend: "embedded" | "jssdk";
  callBackend: "livekit" | "full-mesh";
}

interface PosthogSettings {
  project_api_key?: string;
  api_host?: string;
}

export class PosthogAnalytics {
  /* Wrapper for Posthog analytics.
   * 3 modes of anonymity are supported, governed by this.anonymity
   * - Anonymity.Disabled means *no data* is passed to posthog
   * - Anonymity.Anonymous means no identifier is passed to posthog
   * - Anonymity.Pseudonymous means an analytics ID stored in account_data and shared between devices
   *   is passed to posthog.
   *
   * To update anonymity, call updateAnonymityFromSettings() or you can set it directly via setAnonymity().
   *
   * To pass an event to Posthog:
   *
   * 1. Declare a type for the event, extending IPosthogEvent.
   */

  private static ANALYTICS_EVENT_TYPE = "im.vector.analytics";

  // set true during the constructor if posthog config is present, otherwise false
  private static internalInstance: PosthogAnalytics | null = null;

  private identificationPromise?: Promise<void>;
  private readonly enabled: boolean = false;
  private anonymity = Anonymity.Disabled;
  private platformSuperProperties = {};
  private registrationType: RegistrationType = RegistrationType.Guest;

  public static hasInstance(): boolean {
    return Boolean(this.internalInstance);
  }

  public static get instance(): PosthogAnalytics {
    if (!this.internalInstance) {
      this.internalInstance = new PosthogAnalytics(posthog);
    }
    return this.internalInstance;
  }

  private constructor(private readonly posthog: PostHog) {
    const posthogConfig: PosthogSettings = {
      project_api_key: Config.get().posthog?.api_key,
      api_host: Config.get().posthog?.api_host,
    };

    if (posthogConfig.project_api_key && posthogConfig.api_host) {
      if (
        PosthogAnalytics.getPlatformProperties().matrixBackend === "embedded"
      ) {
        const { analyticsID } = getUrlParams();
        // if the embedding platform (element web) already got approval to communicating with posthog
        // element call can also send events to posthog
        optInAnalytics.setValue(Boolean(analyticsID));
      }

      this.posthog.init(posthogConfig.project_api_key, {
        api_host: posthogConfig.api_host,
        autocapture: false,
        mask_all_text: true,
        mask_all_element_attributes: true,
        capture_pageview: false,
        sanitize_properties: this.sanitizeProperties,
        respect_dnt: true,
        advanced_disable_decide: true,
      });
      this.enabled = true;
    } else {
      logger.info(
        "Posthog is not enabled because there is no api key or no host given in the config",
      );
      this.enabled = false;
    }
    this.startListeningToSettingsChanges(); // Triggers maybeIdentifyUser
  }

  private sanitizeProperties = (
    properties: Properties,
    _eventName: string,
  ): Properties => {
    // Callback from posthog to sanitize properties before sending them to the server.
    // Here we sanitize posthog's built in properties which leak PII e.g. url reporting.
    // See utils.js _.info.properties in posthog-js.

    if (this.anonymity == Anonymity.Anonymous) {
      // drop referrer information for anonymous users
      properties["$referrer"] = null;
      properties["$referring_domain"] = null;
      properties["$initial_referrer"] = null;
      properties["$initial_referring_domain"] = null;

      // drop device ID, which is a UUID persisted in local storage
      properties["$device_id"] = null;
    }
    // the url leaks a lot of private data like the call name or the user.
    // Its stripped down to the bare minimum to only give insights about the host (develop, main or sfu)
    properties["$current_url"] = (properties["$current_url"] as string)
      .split("/")
      .slice(0, 3)
      .join("");

    return properties;
  };

  private registerSuperProperties(properties: Properties): void {
    if (this.enabled) {
      this.posthog.register(properties);
    }
  }

  private static getPlatformProperties(): PlatformProperties {
    const appVersion = import.meta.env.VITE_APP_VERSION || "dev";
    return {
      appVersion,
      matrixBackend: widget ? "embedded" : "jssdk",
      callBackend: "livekit",
    };
  }

  private capture(
    eventName: string,
    properties: Properties,
    options?: CaptureOptions,
  ): void {
    if (!this.enabled) {
      return;
    }
    this.posthog.capture(eventName, { ...properties }, options);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private setAnonymity(anonymity: Anonymity): void {
    // Update this.anonymity.
    // To update the anonymity typically you want to call updateAnonymityFromSettings
    // to ensure this value is in step with the user's settings.
    if (
      this.enabled &&
      (anonymity == Anonymity.Disabled || anonymity == Anonymity.Anonymous)
    ) {
      // when transitioning to Disabled or Anonymous ensure we clear out any prior state
      // set in posthog e.g. distinct ID
      this.posthog.reset();
      // Restore any previously set platform super properties
      this.updateSuperProperties();
    }
    this.anonymity = anonymity;
  }

  private static getRandomAnalyticsId(): string {
    return [...crypto.getRandomValues(new Uint8Array(16))]
      .map((c) => c.toString(16))
      .join("");
  }

  private async identifyUser(
    analyticsIdGenerator: () => string,
  ): Promise<void> {
    if (this.anonymity == Anonymity.Pseudonymous && this.enabled) {
      // Check the user's account_data for an analytics ID to use. Storing the ID in account_data allows
      // different devices to send the same ID.
      let analyticsID = await this.getAnalyticsId();
      try {
        if (!analyticsID && !widget) {
          // only try setting up a new analytics ID in the standalone app.

          // Couldn't retrieve an analytics ID from user settings, so create one and set it on the server.
          // Note there's a race condition here - if two devices do these steps at the same time, last write
          // wins, and the first writer will send tracking with an ID that doesn't match the one on the server
          // until the next time account data is refreshed and this function is called (most likely on next
          // page load). This will happen pretty infrequently, so we can tolerate the possibility.
          const accountDataAnalyticsId = analyticsIdGenerator();
          await this.setAccountAnalyticsId(accountDataAnalyticsId);
          analyticsID = await this.hashedEcAnalyticsId(accountDataAnalyticsId);
        }
      } catch (e) {
        // The above could fail due to network requests, but not essential to starting the application,
        // so swallow it.
        logger.log(
          "Unable to identify user for tracking" + (e as Error)?.toString(),
        );
      }
      if (analyticsID) {
        this.posthog.identify(analyticsID);
      } else {
        logger.info(
          "No analyticsID is availble. Should not try to setup posthog",
        );
      }
    }
  }

  private async getAnalyticsId(): Promise<string | null> {
    const client: MatrixClient = window.matrixclient;
    let accountAnalyticsId;
    if (widget) {
      accountAnalyticsId = getUrlParams().analyticsID;
    } else {
      const accountData = await client.getAccountDataFromServer(
        PosthogAnalytics.ANALYTICS_EVENT_TYPE,
      );
      accountAnalyticsId = accountData?.id;
    }
    if (accountAnalyticsId) {
      // we dont just use the element web analytics ID because that would allow to associate
      // users between the two posthog instances. By using a hash from the username and the element web analytics id
      // it is not possible to conclude the element web posthog user id from the element call user id and vice versa.
      return await this.hashedEcAnalyticsId(accountAnalyticsId);
    }
    return null;
  }

  private async hashedEcAnalyticsId(
    accountAnalyticsId: string,
  ): Promise<string> {
    const client: MatrixClient = window.matrixclient;
    const posthogIdMaterial = "ec" + accountAnalyticsId + client.getUserId();
    const bufferForPosthogId = await crypto.subtle.digest(
      "sha-256",
      Buffer.from(posthogIdMaterial, "utf-8"),
    );
    const view = new Int32Array(bufferForPosthogId);
    return Array.from(view)
      .map((b) => Math.abs(b).toString(16).padStart(2, "0"))
      .join("");
  }

  private async setAccountAnalyticsId(analyticsID: string): Promise<void> {
    if (!widget) {
      const client = window.matrixclient;

      // the analytics ID only needs to be set in the standalone version.
      const accountData = await client.getAccountDataFromServer(
        PosthogAnalytics.ANALYTICS_EVENT_TYPE,
      );
      await client.setAccountData(
        PosthogAnalytics.ANALYTICS_EVENT_TYPE,
        Object.assign({ id: analyticsID }, accountData),
      );
    }
  }

  public getAnonymity(): Anonymity {
    return this.anonymity;
  }

  public logout(): void {
    if (this.enabled) {
      this.posthog.reset();
    }
    this.setAnonymity(Anonymity.Disabled);
  }

  public onLoginStatusChanged(): void {
    this.maybeIdentifyUser();
  }

  private updateSuperProperties(): void {
    // Update super properties in posthog with our platform (app version, platform).
    // These properties will be subsequently passed in every event.
    //
    // This only needs to be done once per page lifetime. Note that getPlatformProperties
    this.platformSuperProperties = PosthogAnalytics.getPlatformProperties();
    this.registerSuperProperties({
      ...this.platformSuperProperties,
      registrationType:
        this.registrationType == RegistrationType.Guest
          ? "Guest"
          : "Registered",
    });
  }

  private userRegisteredInThisSession(): boolean {
    // only if the signup end got tracked the end time is set. Otherwise its default value is Date(0).
    return this.eventSignup.getSignupEndTime() > new Date(0);
  }

  private async maybeIdentifyUser(): Promise<void> {
    // We may not yet have a Matrix client at this point, if not, bail. This should get
    // triggered again by onLoginStatusChanged once we do have a client.
    if (!window.matrixclient) return;

    if (this.anonymity === Anonymity.Pseudonymous) {
      this.setRegistrationType(
        window.matrixclient.isGuest() || window.passwordlessUser
          ? RegistrationType.Guest
          : RegistrationType.Registered,
      );
      // store the promise to await posthog-tracking-events until the identification is done.
      this.identificationPromise = this.identifyUser(
        PosthogAnalytics.getRandomAnalyticsId,
      );
      await this.identificationPromise;
      if (this.userRegisteredInThisSession()) {
        this.eventSignup.track();
      }
    }

    if (this.anonymity !== Anonymity.Disabled) {
      this.updateSuperProperties();
    }
  }

  public async trackEvent<E extends IPosthogEvent>(
    { eventName, ...properties }: E,
    options?: CaptureOptions,
  ): Promise<void> {
    if (this.identificationPromise) {
      // only make calls to posthog after the identificaion is done
      await this.identificationPromise;
    }
    if (
      this.anonymity == Anonymity.Disabled ||
      this.anonymity == Anonymity.Anonymous
    )
      return;
    this.capture(eventName, properties, options);
  }

  private startListeningToSettingsChanges(): void {
    // Listen to account data changes from sync so we can observe changes to relevant flags and update.
    // This is called -
    //  * On page load, when the account data is first received by sync
    //  * On login
    //  * When another device changes account data
    //  * When the user changes their preferences on this device
    // Note that for new accounts, pseudonymousAnalyticsOptIn won't be set, so updateAnonymityFromSettings
    // won't be called (i.e. this.anonymity will be left as the default, until the setting changes)
    optInAnalytics.value.subscribe((optIn) => {
      this.setAnonymity(optIn ? Anonymity.Pseudonymous : Anonymity.Disabled);
      this.maybeIdentifyUser();
    });
  }

  public setRegistrationType(registrationType: RegistrationType): void {
    this.registrationType = registrationType;
    if (
      this.anonymity == Anonymity.Disabled ||
      this.anonymity == Anonymity.Anonymous
    )
      return;
    this.updateSuperProperties();
  }

  // ----- Events

  public eventCallEnded = new CallEndedTracker();
  public eventSignup = new SignupTracker();
  public eventCallStarted = new CallStartedTracker();
  public eventLogin = new LoginTracker();
  public eventMuteMicrophone = new MuteMicrophoneTracker();
  public eventMuteCamera = new MuteCameraTracker();
  public eventUndecryptableToDevice = new UndecryptableToDeviceEventTracker();
  public eventQualitySurvey = new QualitySurveyEventTracker();
  public eventCallDisconnected = new CallDisconnectedEventTracker();
  public eventCallConnectDuration = new CallConnectDurationTracker();
}
