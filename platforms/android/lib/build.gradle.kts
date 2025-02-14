/*
 * Copyright 2025 New Vector Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.maven.publish)
}

repositories {
    mavenCentral()
    google()
}

android {
    namespace = "io.element.call.android"

    defaultConfig {
        compileSdk = 35
        minSdk = 24
    }
}

publishing {
    repositories {
        maven {
            name = "githubPackages"
            url = uri("https://maven.pkg.github.com/element-hq/element-call")
            // username and password (a personal Github access token) should be specified as
            // `githubPackagesUsername` and `githubPackagesPassword` Gradle properties or alternatively
            // as `ORG_GRADLE_PROJECT_githubPackagesUsername` and `ORG_GRADLE_PROJECT_githubPackagesPassword`
            // environment variables
            if (!providers.gradleProperty("githubPackagesUsername").isPresent) {
                credentials(PasswordCredentials::class)
            } else {
                // Assune we're in CI and try getting the GH env vars
                credentials {
                    username = System.getenv("GITHUB_ACTOR")
                    password = System.getenv("GITHUB_TOKEN")
                }
            }
        }
    }
}

mavenPublishing {
    signAllPublications()

    val version = property("MAVEN_VERSION_NAME") as? String
    coordinates("io.element.call", "android", version)
    if (!providers.gradleProperty("githubPackagesUsername").isPresent) {
        println("No GH credentials provided")
    }
    pom {
        name = "Element Call - Android"
        description.set("Assets needed to embed Element Call into an Android application.")
        inceptionYear.set("2025")
        url.set("https://github.com/element-hq/element-call/")
        licenses {
            license {
                name.set("GNU Affero General Public License (AGPL) version 3.0")
                url.set("https://www.gnu.org/licenses/agpl-3.0.txt")
                distribution.set("https://www.gnu.org/licenses/agpl-3.0.txt")
            }
            license {
                name.set("Element Commercial License")
                url.set("https://raw.githubusercontent.com/element-hq/element-call/refs/heads/livekit/LICENSE-COMMERCIAL")
                distribution.set("https://raw.githubusercontent.com/element-hq/element-call/refs/heads/livekit/LICENSE-COMMERCIAL")
            }
        }
        developers {
            developer {
                id.set("matrixdev")
                name.set("matrixdev")
                url.set("https://github.com/element-hq/")
                email.set("android@element.io")
            }
        }
        scm {
            url.set("https://github.com/element-hq/element-call/")
            connection.set("scm:git:git://github.com/element-hq/element-call.git")
            developerConnection.set("scm:git:ssh://git@github.com/element-hq/element-call.git")
        }
    }
}