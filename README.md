# WASAP 2 — asistencia y mensajería TCP

Servidor Kotlin/JVM 25 y aplicación Expo/React Native para Android e iPhone.
Todo el tráfico de la aplicación usa el protocolo propio sobre TCP con TLS.
PostgreSQL es remoto y solo el servidor conoce sus credenciales.

Incluye entrada/salida alternada sin límite diario, historial personal, chat
general, privados, grupos y administración por consola. La secuencia de asistencia
continúa entre días. Reintentar una operación confirmada no crea otro registro.

## Documentación y evidencia

- [Arquitectura y recorridos](docs/architecture.md): diagramas de componentes, red local, confirmación y estados.
- [Capturas y verificación](docs/verification.md): imágenes reales de Android, resultados y pendientes.
- [Protocolo TCP/TLS](docs/protocol.md): tramas, operaciones, permisos y recuperación.
- [Entorno local con Compose](docs/local-runtime.md): PostgreSQL persistente y servidor.
- [Guía móvil](mobile/README.md): emulador por CLI, Android, Xcode y EAS.
- [Necesidades de backend](docs/mobile-backend-needs.md): cambios completados y opciones futuras.

## Base y servidor locales con Compose

Para desarrollo, [la guía local](docs/local-runtime.md#postgresql-y-servidor-con-compose-recomendado) levanta PostgreSQL persistente y el servidor juntos con `compose.local.yaml`. En Podman utiliza también `compose.local.podman.yaml`. El archivo `compose.yaml` de la siguiente sección requiere una base externa.

## Servidor con Docker

Necesitas Docker con Compose, OpenSSL y una base PostgreSQL (17 o posterior) ya
creada. La cuenta de la base debe poder crear el esquema y ejecutar las migraciones.

```bash
cp .env.example .env
bash scripts/create-certs.sh 192.168.1.50
```

Sustituye la IP por la del equipo servidor. Edita `.env` con la URL JDBC, usuario y
tu UID/GID (`id -u` y `id -g`); esto permite leer archivos privados sin ejecutar el
servidor como root. El puerto predeterminado es 5050 y debe estar permitido en el
firewall de la LAN. Los teléfonos necesitan alcanzar la IP del equipo anfitrión,
no la IP interna del contenedor. La red Wi-Fi no debe aislar sus clientes.

Guarda la contraseña de PostgreSQL en un archivo local protegido:

```bash
umask 077
read -rs -p 'Contraseña PostgreSQL: ' wasap_db_password
printf '%s' "$wasap_db_password" > certs/db-password
unset wasap_db_password
docker compose up --build -d
docker compose logs -f server
```

La URL de ejemplo usa las CA públicas del JDK y valida la identidad de PostgreSQL.
Si tu proveedor entrega una CA privada, monta su certificado en el contenedor y
configura `sslrootcert` según pgJDBC. No desactives la validación TLS para producción.
El contenedor aplica las migraciones antes de escuchar y comprueba su salud por
TLS y base de datos. Las contraseñas y certificados privados no van en la imagen.

El certificado público `certs/ca.crt` se incorpora a la compilación móvil. Guarda
`ca.key` fuera del contenedor y de los teléfonos. Si cambia la IP, vuelve a ejecutar
el script con la misma CA y reinicia el servidor; no hace falta cambiar la CA de la
app. Si cambia la CA sí se necesita recompilar la app. Los certificados del servidor
duran un año; el script permite renovarlos. No incluyas `certs/` ni `.env` en Git.

Para probar desde Linux sin abrir Android Studio, sigue la [guía para iniciar el emulador por terminal](mobile/README.md#emulador-android-desde-la-terminal-sin-abrir-android-studio), con conexión al servidor local y Metro.

## Administración

```bash
docker compose exec server /app/bin/wasap-server admin users add 20260001 'Ana Pérez'
docker compose exec server /app/bin/wasap-server admin users list
docker compose exec server /app/bin/wasap-server admin users reset-pin 20260001
docker compose exec server /app/bin/wasap-server admin attendance 20260001 2026-11-01 2026-11-30
docker compose exec server /app/bin/wasap-server admin attendance '*' 2026-11-01 2026-11-30
```

El PIN se solicita sin mostrarlo en una terminal interactiva; no lo pases como
argumento. Restablecerlo invalida las sesiones anteriores. La consulta de asistencia
devuelve hasta 100 movimientos y un `nextCursor`; pásalo como último argumento para
continuar. Las fechas son inclusivas en `APP_TIMEZONE` (America/Mexico_City por defecto).

## App Android e iPhone

Consulta [la guía móvil](mobile/README.md). El mismo proyecto permite compilaciones
en EAS y compilaciones locales en macOS con Xcode. Android puede compilarse localmente
con su SDK. Se utiliza una compilación nativa propia; Expo Go no incorpora el módulo TCP.

Configura IP y puerto desde la app, inicia sesión con matrícula/PIN y registra tu
asistencia. Cada usuario consulta solo su historial. El creador de un grupo administra
sus integrantes; al retirar a alguien pierde acceso a futuras consultas y entregas.
Los grupos admiten hasta 100 miembros. Los mensajes son de texto, hasta 4000 caracteres.

La app recupera historial al volver del segundo plano y tras reconectar. No crea
nuevas operaciones sin conexión. Conserva las operaciones ya enviadas que aún no
tengan confirmación y las reconcilia con el mismo identificador. Cambiar de servidor
o cerrar sesión no traslada pendientes a otra identidad. Las sesiones caducan a las
24 horas o al reiniciar el servidor. No hay notificaciones push ni panel web en v1.

## Desarrollo y pruebas

Necesitas JDK 25 completo. El wrapper descarga la versión fijada de Gradle.

```bash
cd server
./gradlew test installDist
```

Las pruebas de integración usan PostgreSQL real y crean/eliminan exclusivamente
esquemas temporales con nombre aleatorio. Para ejecutarlas desde la raíz:

```bash
docker compose -f compose.test.yaml up -d --wait
export WASAP_TEST_DB_URL='jdbc:postgresql://127.0.0.1:55432/wasap_test?sslmode=disable'
export WASAP_TEST_DB_USER=wasap_test
export WASAP_TEST_DB_PASSWORD=wasap_test
cd server
./gradlew test integrationTest
cd ..
docker compose -f compose.test.yaml down
```

El PostgreSQL de pruebas es efímero y solo se publica en localhost. No uses una base
de producción para pruebas. OpenSSL es necesario para la prueba de sockets TLS.
`DB_ALLOW_INSECURE=true` existe exclusivamente para desarrollo/pruebas locales.

El [contrato del protocolo](docs/protocol.md) define tramas, operaciones, cursores,
errores y garantías de reintento. Los mensajes y asistencias se confirman después
del commit; si PostgreSQL falla no se muestra una confirmación falsa.
