# Manual de prueba de Wasap en la red local

Necesitas la computadora que ejecuta Docker, dos teléfonos Android con el APK de
Wasap, dos cuentas de prueba y una Wi‑Fi que permita la comunicación entre equipos.
En los ejemplos, cambia `192.168.1.50` por la IP Wi‑Fi real de la computadora.
Puedes consultarla con `ip -br -4 addr`.

## 1. Preparar el servidor

Si ya puedes abrir el panel, pasa a comprobar el puerto de la app. Si Docker muestra
`external volume "wasap-local-pgdata" not found` y es una instalación nueva en Docker,
crea el volumen con `docker volume create wasap-local-pgdata`. Para los archivos
que falten, sigue la [preparación de una instalación nueva](local-runtime.md#entorno-nuevo-con-docker).
Conserva la contraseña y la CA de una instalación existente.

En `compose.local.yaml`, cambia el puerto publicado de la app de
`"127.0.0.1:5050:5050"` a `"192.168.1.50:5050:5050"` con tu IP real. El panel puede
seguir publicado en `127.0.0.1:5443`.

El certificado del servidor debe incluir esa IP. Si tu instalación usa
`certs/server.p12` y todavía conservas la clave de su CA, puedes emitir la hoja
para la nueva IP con `bash scripts/create-certs.sh 192.168.1.50`. Si tu CA se
gestiona desde el servidor, usa el [procedimiento de emisión](../README.md#certificados-desde-el-servidor-recomendado).
Si reemplazaste el archivo montado, recrea el servicio con
`docker compose -f compose.local.yaml up -d --force-recreate server`.

```bash
export WASAP_UID="$(id -u)" WASAP_GID="$(id -g)"
docker compose -f compose.local.yaml up -d --wait
docker compose -f compose.local.yaml exec server /app/bin/wasap-server healthcheck
```

## 2. Abrir el panel y crear cuentas

Abre `https://127.0.0.1:5443` desde la computadora del servidor. Si el navegador
muestra «No seguro», comprueba que la URL empiece por `https://` y agrega
`certs/ca.crt` al almacén de confianza que use el navegador. Ese archivo es el
certificado público de la CA.

Si aún no tienes administrador, créalo desde la computadora. El primer comando
pide el PIN de forma interactiva.

```bash
docker compose -f compose.local.yaml exec server /app/bin/wasap-server admin users add ADM001 'Administración'
docker compose -f compose.local.yaml exec server /app/bin/wasap-server admin users role ADM001 admin
```

Entra con ADM001 y su PIN. En **Usuarios → Nueva cuenta**, crea dos cuentas de
prueba con matrículas distintas y guarda sus PIN para iniciar sesión en los
teléfonos.

## 3. Añadir el servidor en los teléfonos

En el panel, abre **Servidor**. El QR toma la dirección del certificado del
servidor. Puedes abrir el panel en `127.0.0.1` y usar el mismo QR para teléfonos
si el certificado anuncia la IP Wi‑Fi correcta.

1. Pulsa **Descargar PNG para imprimir**, abre la imagen y amplíala hasta que se
   vea grande, con los cuatro lados y todo el borde blanco visibles.
2. Con el teléfono en la misma Wi‑Fi, abre **Escanear servidor** y apunta al QR.
3. Si la cámara no lo lee, abre **Enlace en texto** en el panel. Copia el enlace
   completo `wasap://server?…`, pásalo al teléfono y usa **Pegar enlace en su lugar**.
4. Confirma que la app muestre la IP Wi‑Fi y el puerto `5050`. Puedes comparar
   la huella de la CA con la que imprime este comando antes de guardar.

```bash
docker compose -f compose.local.yaml exec server /app/bin/wasap-server certs qr --address 192.168.1.50
```

## 4. Probar desde ambos teléfonos

| Acción | Resultado esperado |
| --- | --- |
| Inicia sesión con una cuenta distinta en cada teléfono. | Ambos pueden entrar al mismo servidor. |
| Registra entrada y salida desde el primer teléfono. | Los dos movimientos aparecen en su historial y se pueden verificar exportando el CSV en **Clases → Puerta general** del panel. |
| Envía un mensaje en el chat general desde el primero y responde desde el segundo. | Ambos ven los dos mensajes. |
| Corta el Wi‑Fi justo después de tocar Enviar y vuelve a conectarlo. | Si la app alcanzó a poner el mensaje en cola, se resuelve el pendiente y el mensaje aparece una sola vez. |

## Si algo falla

- **La cámara se queda en el escáner.** Usa el PNG ampliado o el enlace de texto.
  Si el enlace funciona, puedes seguir con la prueba aunque la cámara no lo lea.
- **La app abre el enlace pero dice que el servidor no está disponible.** Revisa
  la IP que muestra, el puerto publicado y el firewall para TCP `5050`. Comprueba
  que la Wi‑Fi permita que los teléfonos lleguen a la computadora.
- **La app indica un error TLS.** Confirma que la IP aparezca en el certificado
  vigente y que el QR corresponda al servidor que estás ejecutando.
- **Falla el healthcheck.** Revisa
  `docker compose -f compose.local.yaml logs --tail 80 server db`.
