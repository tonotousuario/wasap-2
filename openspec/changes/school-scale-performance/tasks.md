# Tasks

## 1. Medir

- [ ] 1.1 Generador de carga (`./gradlew loadTest`) con usuarios en esquema temporal, percentiles y verificación de duplicados; ejecutarlo contra el código actual y guardar la línea base en `docs/verification.md`

## 2. Ajustar

- [ ] 2.1 `DB_POOL_SIZE` y `MAX_CONNECTIONS` configurables; prueba de arranque con valores inválidos
- [ ] 2.2 Caché de membresía con invalidación en commit; prueba de integración: retirada con caché caliente no entrega mensajes posteriores
- [ ] 2.3 Interfaz `EventBus` con implementación en memoria y diseño de `PostgresEventBus` documentado; pruebas existentes en verde
- [ ] 2.4 Revisar índices con `EXPLAIN` de las consultas calientes y añadir los que falten en una migración

## 3. Demostrar

- [ ] 3.1 Ejecutar el escenario de 2 000 conexiones y documentar resultados y hardware en `docs/verification.md`; si no se cumple, registrar el cuello y su ajuste
