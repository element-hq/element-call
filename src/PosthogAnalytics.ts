/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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

import { widget } from "./widget";
import { settingsBus } from "./settings/useSetting";
import {
  CallEndedTracker,
  CallStartedTracker,
  LoginTracker,
  SignupTracker,
  MuteCameraTracker,
  MuteMicrophoneTracker,
} from "./PosthogEvents";
import { Config } from "./config/Config";

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
 *   so that the user can be identify in posthog.
 */

export interface IPosthogEvent {
  // The event name that will be used by PostHog. Event names should use camelCase.
  eventName: string;

  // do not allow these to be sent manually, we enqueue them all for caching purposes
  $set?: void;
  $set_once?: void;
}

export interface IPostHogEventOptions {
  timestamp?: Date;
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
  private static internalInstance = null;

  private readonly enabled: boolean = false;
  private anonymity = Anonymity.Pseudonymous;
  private platformSuperProperties = {};
  private registrationType: RegistrationType = RegistrationType.Guest;

  public static get instance(): PosthogAnalytics {
    if (!this.internalInstance) {
      this.internalInstance = new PosthogAnalytics(posthog);
    }
    return this.internalInstance;
  }

  constructor(private readonly posthog: PostHog) {
    const posthogConfig: PosthogSettings = {
      project_api_key: Config.instance.config.posthog?.api_key,
      api_host: Config.instance.config.posthog?.api_host,
    };
    if (posthogConfig.project_api_key && posthogConfig.api_host) {
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
      this.enabled = false;
    }
    this.startListeningToSettingsChanges();
  }

  private sanitizeProperties = (
    properties: Properties,
    _eventName: string
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

    return properties;
  };

  private registerSuperProperties(properties: Properties) {
    if (this.enabled) {
      this.posthog.register(properties);
    }
  }

  private static getPlatformProperties(): PlatformProperties {
    const appVersion = import.meta.env.VITE_APP_VERSION || "unknown";
    return {
      appVersion,
      matrixBackend: widget ? "embedded" : "jssdk",
    };
  }

  private capture(
    eventName: string,
    properties: Properties,
    options?: CaptureOptions
  ) {
    if (!this.enabled) {
      return;
    }
    this.posthog.capture(eventName, { ...properties }, options);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  setAnonymity(anonymity: Anonymity): void {
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

  public async identifyUser(analyticsIdGenerator: () => string): Promise<void> {
    // There might be a better way to get the client here.
    const client = window.matrixclient;

    if (this.anonymity == Anonymity.Pseudonymous) {
      // Check the user's account_data for an analytics ID to use. Storing the ID in account_data allows
      // different devices to send the same ID.
      try {
        const accountData = await client.getAccountDataFromServer(
          PosthogAnalytics.ANALYTICS_EVENT_TYPE
        );
        let analyticsID = accountData?.id;
        if (!analyticsID) {
          // Couldn't retrieve an analytics ID from user settings, so create one and set it on the server.
          // Note there's a race condition here - if two devices do these steps at the same time, last write
          // wins, and the first writer will send tracking with an ID that doesn't match the one on the server
          // until the next time account data is refreshed and this function is called (most likely on next
          // page load). This will happen pretty infrequently, so we can tolerate the possibility.
          analyticsID = analyticsIdGenerator();
          await client.setAccountData(
            PosthogAnalytics.ANALYTICS_EVENT_TYPE,
            Object.assign({ id: analyticsID }, accountData)
          );
        }
        this.posthog.identify(analyticsID);
      } catch (e) {
        // The above could fail due to network requests, but not essential to starting the application,
        // so swallow it.
        logger.log("Unable to identify user for tracking" + e.toString());
      }
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

  public async updateSuperProperties(): Promise<void> {
    // Update super properties in posthog with our platform (app version, platform).
    // These properties will be subsequently passed in every event.
    //
    // This only needs to be done once per page lifetime. Note that getPlatformProperties
    // is async and can involve a network request if we are running in a browser.
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
    return this.eventSignup.getSignupEndTime() > new Date(0);
  }

  public async updateAnonymityFromSettings(
    pseudonymousOptIn: boolean
  ): Promise<void> {
    // Update this.anonymity based on the user's analytics opt-in settings
    const anonymity = pseudonymousOptIn
      ? Anonymity.Pseudonymous
      : Anonymity.Disabled;
    this.setAnonymity(anonymity);
    if (anonymity === Anonymity.Pseudonymous) {
      await this.identifyUser(PosthogAnalytics.getRandomAnalyticsId);
      if (this.userRegisteredInThisSession()) {
        this.eventSignup.track();
      }
    }

    if (anonymity !== Anonymity.Disabled) {
      await this.updateSuperProperties();
    }
  }

  public trackEvent<E extends IPosthogEvent>(
    { eventName, ...properties }: E,
    options?: IPostHogEventOptions
  ): void {
    if (
      this.anonymity == Anonymity.Disabled ||
      this.anonymity == Anonymity.Anonymous
    )
      return;
    this.capture(eventName, properties, options);
  }

  public startListeningToSettingsChanges(): void {
    // Listen to account data changes from sync so we can observe changes to relevant flags and update.
    // This is called -
    //  * On page load, when the account data is first received by sync
    //  * On login
    //  * When another device changes account data
    //  * When the user changes their preferences on this device
    // Note that for new accounts, pseudonymousAnalyticsOptIn won't be set, so updateAnonymityFromSettings
    // won't be called (i.e. this.anonymity will be left as the default, until the setting changes)
    settingsBus.on("opt-in-analytics", (optInAnalytics) => {
      this.updateAnonymityFromSettings(optInAnalytics);
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
}
