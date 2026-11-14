# Entorno local de prueba

Se ha iniciado con Podman (motor instalado, compatible con imágenes Docker).

- `wasap-local-db`: PostgreSQL 17, base/usuario `wasap`, red privada `wasap-local`.
- `wasap-local-server`: JVM/TLS publicado únicamente en `127.0.0.1:5050`.
- Datos persistentes: volumen `wasap-local-pgdata`. No eliminarlo para conservar asistencias.
- Configuración privada generada en `.local/`, ignorada por Git; contraseña en `certs/db-password`.
- PostgreSQL usa conexión sin TLS únicamente en esta red local privada de contenedores.
  La conexión app-servidor sigue usando TLS con la CA de `certs/ca.crt`.

## Emulador

```bash
/home/kedap/Android/Sdk/platform-tools/adb reverse tcp:5050 tcp:5050
```

Configurar en WASAP `127.0.0.1`, puerto `5050`. Matrícula inicial `DEMO001`,
PIN de demostración `123456`. Cambiarlo antes de usar datos reales.

## Operación

```bash
podman logs --tail 50 wasap-local-server
podman exec wasap-local-server /app/bin/wasap-server healthcheck
podman stop wasap-local-server wasap-local-db
podman start wasap-local-db wasap-local-server
podman exec -it wasap-local-server /app/bin/wasap-server admin users add DEMO002 'Otra persona'
podman exec wasap-local-server /app/bin/wasap-server admin attendance DEMO001
```

La imagen usada es `localhost/wasap-server:dev`. Para modificar el código del
servidor hace falta reconstruirla y recrear su contenedor conservando los montajes,
la red, variables de `.local/server.env` y el volumen PostgreSQL. La configuración
Compose de producción permanece independiente y exige PostgreSQL remoto con TLS.
