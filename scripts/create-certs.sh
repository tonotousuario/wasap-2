#!/usr/bin/env bash
set -euo pipefail
umask 077
server_ip=${1:?Usage: create-certs.sh SERVER_IP [OUTPUT_DIRECTORY]}
cert_dir=${2:-certs}
mkdir -p "$cert_dir"
if [[ ! -f "$cert_dir/ca.key" ]]; then
  [[ ! -e "$cert_dir/ca.crt" ]] || { echo 'CA certificate exists without its key; restore the key or use another directory.' >&2; exit 1; }
  openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 \
    -keyout "$cert_dir/ca.key" -out "$cert_dir/ca.crt" \
    -subj '/CN=WASAP Installation CA' \
    -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign'
fi
[[ -s "$cert_dir/keystore-password" ]] || openssl rand -base64 32 > "$cert_dir/keystore-password"
openssl req -new -newkey rsa:2048 -nodes -sha256 -keyout "$cert_dir/server.key" \
  -out "$cert_dir/server.csr" -subj '/CN=WASAP Server'
cat > "$cert_dir/server.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:$server_ip,IP:127.0.0.1
EOF
openssl x509 -req -in "$cert_dir/server.csr" -CA "$cert_dir/ca.crt" -CAkey "$cert_dir/ca.key" \
  -CAcreateserial -out "$cert_dir/server.crt" -days 365 -sha256 -extfile "$cert_dir/server.ext"
openssl pkcs12 -export -name wasap -inkey "$cert_dir/server.key" -in "$cert_dir/server.crt" \
  -certfile "$cert_dir/ca.crt" -out "$cert_dir/server.p12" -passout "file:$cert_dir/keystore-password"
printf 'Certificates created in %s. Bundle only ca.crt in the mobile app. Keep ca.key offline.\n' "$cert_dir"
