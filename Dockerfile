FROM docker.io/library/eclipse-temurin:25-jdk-alpine AS build
WORKDIR /src
COPY server/gradlew server/gradlew.bat ./
COPY server/gradle ./gradle
COPY server/settings.gradle.kts server/build.gradle.kts ./
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies
COPY server/src ./src
RUN ./gradlew --no-daemon test installDist

FROM docker.io/library/eclipse-temurin:25-jre-alpine
RUN addgroup -g 10001 wasap && adduser -D -u 10001 -G wasap wasap
WORKDIR /app
COPY --from=build --chown=wasap:wasap /src/build/install/wasap-server /app
USER wasap
EXPOSE 5050/tcp
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD ["/app/bin/wasap-server", "healthcheck"]
ENTRYPOINT ["/app/bin/wasap-server"]
CMD ["serve"]
