/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import posthog, {
  type CaptureOptions,
  type PostHog,
  type Properties,
} from "posthog-js";
import { logger } from "matrix-js-sdk/lib/logger";
import { type MatrixClient } from "matrix-js-sdk";
import { type Subscription } from "rxjs";

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
  cryptoVersion?: string;
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

  private static ANALYTICS_EVENT_TYPE = "im.vector.analytics" as const;

  // set true during the constructor if posthog config is present, otherwise false
  private static internalInstance: PosthogAnalytics | null = null;

  private identificationPromise?: Promise<void>;
  private readonly enabled: boolean = false;
  private anonymity = Anonymity.Disabled;
  private platformSuperProperties = {};
  private registrationType: RegistrationType = RegistrationType.Guest;
  private optInListener: Subscription | null = null;

  public static hasInstance(): boolean {
    return Boolean(this.internalInstance);
  }

  public static get instance(): PosthogAnalytics {
    if (!this.internalInstance) {
      this.internalInstance = new PosthogAnalytics(posthog);
    }
    return this.internalInstance;
  }

  public static resetInstance(): void {
    // Reset the singleton instance
    this.internalInstance = null;
  }

  private constructor(private readonly posthog: PostHog) {
    let apiKey: string | undefined;
    let apiHost: string | undefined;
    if (import.meta.env.VITE_PACKAGE === "embedded") {
      // for the embedded package we always use the values from the URL as the widget host is responsible for analytics configuration
      apiKey = getUrlParams().posthogApiKey ?? undefined;
      apiHost = getUrlParams().posthogApiHost ?? undefined;
    } else if (import.meta.env.VITE_PACKAGE === "full") {
      // in full package it is the server responsible for the analytics
      apiKey = Config.get().posthog?.api_key;
      apiHost = Config.get().posthog?.api_host;
    }

    if (apiKey && apiHost) {
      this.posthog.init(apiKey, {
        api_host: apiHost,
        autocapture: false,
        mask_all_text: true,
        mask_all_element_attributes: true,
        capture_pageview: false,
        sanitize_properties: this.sanitizeProperties,
        respect_dnt: true,
        advanced_disable_decide: true,
      });
      this.enabled = true;
    } else if (import.meta.env.MODE !== "test") {
      logger.info(
        "Posthog is not enabled because there is no api key or no host given in the config",
      );
      this.enabled = false;
    }
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
      cryptoVersion: widget
        ? undefined
        : window.matrixclient?.getCrypto()?.getVersion(),
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
          analyticsID = analyticsIdGenerator();
          await this.setAccountAnalyticsId(analyticsID);
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
          "No analyticsID is available. Should not try to setup posthog",
        );
      }
    }
  }

  private async getAnalyticsId(): Promise<string | null> {
    const client: MatrixClient = window.matrixclient;
    if (widget) {
      return getUrlParams().posthogUserId;
    } else {
      const accountData = await client.getAccountDataFromServer(
        PosthogAnalytics.ANALYTICS_EVENT_TYPE,
      );
      return accountData?.id ?? null;
    }
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
    this.optInListener?.unsubscribe();
    this.optInListener = null;
    this.setAnonymity(Anonymity.Disabled);
  }

  public onLoginStatusChanged(): void {
    this.maybeIdentifyUser().catch(() =>
      logger.log("Could not identify user on login status change"),
    );
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

  public trackEvent<E extends IPosthogEvent>(
    { eventName, ...properties }: E,
    options?: CaptureOptions,
  ): void {
    const doCapture = (): void => {
      if (
        this.anonymity == Anonymity.Disabled ||
        this.anonymity == Anonymity.Anonymous
      )
        return;
      this.capture(eventName, properties, options);
    };

    if (this.identificationPromise) {
      // only make calls to posthog after the identification is done
      this.identificationPromise.then(doCapture, (e) => {
        logger.error("Failed to identify user for tracking", e);
      });
    } else {
      doCapture();
    }
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
    this.optInListener ??= optInAnalytics.value$.subscribe((optIn) => {
      this.setAnonymity(optIn ? Anonymity.Pseudonymous : Anonymity.Disabled);
      this.maybeIdentifyUser().catch(() =>
        logger.log("Could not identify user"),
      );
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
