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
    namespace = "io.element.android"

    defaultConfig {
        compileSdk = 35
        minSdk = 24
    }
}

mavenPublishing {
    publishToMavenCentral(automaticRelease = true)

    signAllPublications()

    val version = System.getenv("EC_VERSION")
    coordinates("io.element.android", "element-call-embedded", version)
    pom {
        name = "Embedded Element Call for Android"
        description.set("Android AAR package containing an embedded build of the Element Call widget.")
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
