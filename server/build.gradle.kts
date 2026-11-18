plugins {
    kotlin("jvm") version "2.4.21"
    application
    id("org.jlleitschuh.gradle.ktlint") version "14.2.0"
}

repositories { mavenCentral() }

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("org.postgresql:postgresql:42.7.8")
    implementation("com.zaxxer:HikariCP:7.0.2")
    implementation("org.flywaydb:flyway-core:11.15.0")
    implementation("org.flywaydb:flyway-database-postgresql:11.15.0")
    implementation("org.slf4j:slf4j-simple:2.0.17")
    // X.509 issuance and encrypted PKCS#8 for the installation CA (TLS itself stays on JSSE).
    implementation("org.bouncycastle:bcpkix-jdk18on:1.87")
    implementation("org.bouncycastle:bcprov-jdk18on:1.87")
    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.13.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin { jvmToolchain(25) }
// Formatting rules live in the repository .editorconfig.
ktlint { version = "1.8.0" }
application { mainClass.set("wasap.MainKt") }
tasks.test { useJUnitPlatform { excludeTags("integration") } }
tasks.register<Test>("integrationTest") {
    description = "Runs against an explicitly supplied disposable PostgreSQL database."
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform { includeTags("integration") }
    shouldRunAfter(tasks.test)
}
tasks.jar { manifest { attributes["Main-Class"] = "wasap.MainKt" } }
