# Tasks

## 1. Medir

- [x] 1.1 Generador de carga (`./gradlew loadTest`) con usuarios en esquema temporal, percentiles y verificación de duplicados; ejecutarlo contra el código actual y guardar la línea base en `docs/verification.md`

## 2. Ajustar

- [x] 2.1 `DB_POOL_SIZE` y `MAX_CONNECTIONS` configurables; prueba de arranque con valores inválidos
- [x] 2.2 Caché de membresía con revisión actualizada en la transacción. Prueba de integración con retirada y reincorporación desde otro escritor con la caché caliente.
- [x] 2.3 Interfaz `EventBus` con implementación en memoria y diseño de `PostgresEventBus` documentado. Pruebas de entrega y permisos en verde.
- [x] 2.4 Revisar índices con `EXPLAIN` de las consultas calientes y añadir los que falten en una migración. Los índices existentes cubrieron las consultas medidas.

## 3. Demostrar

- [x] 3.1 Ejecutar el escenario de 2 000 conexiones y documentar resultados y hardware en `docs/verification.md`; si no se cumple, registrar el cuello y su ajuste
