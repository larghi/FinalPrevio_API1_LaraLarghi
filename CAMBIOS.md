# Cambios y validación

## Funcionalidad 1 — Umbral editable

Camibios realizados: 
    Sobre los archivos: `src/views/PlantScreen.tsx`, `src/viewmodel/usePlantViewModel.ts`, `src/data/localDb.ts` y `src/components/OverviewWeb.tsx`.

Se agregó un formulario para editar el límite de cada equipo. Acepta valores mayores que 0 y hasta 150, guarda en SQLite y actualiza las alarmas y el panel HTML.

Verificación ejecutada:  se probaron validación, guardado, errores y reintentos mediante pruebas automatizadas. Falta comprobar el formulario y la persistencia en un dispositivo.

## Funcionalidad 2 — Historial por equipo

Cambios realizados:
    Sobre los archivos: `src/views/PlantScreen.tsx`, `src/viewmodel/usePlantViewModel.ts` y `src/data/localDb.ts`.

Se agregó un historial por equipo con las últimas 10 lecturas, de la más reciente a la más antigua. Muestra fecha, temperatura y origen, con estados de carga, vacío y error.

Verificación ejecutada: Se probaron el orden, el límite de registros, la separación por equipo y la persistencia en una base SQLite de prueba. Falta comprobarlo en un dispositivo.

## Refactorización A — Filtro SQL parametrizado

Cambios realizados:
    Sobre los archivos: `src/data/localDb.ts`.

Problema: `findEquipment` incorporaba el texto del usuario dentro del SQL, por lo que un apóstrofo podía romper o alterar la consulta.

Solución: la estructura del SQL contiene únicamente placeholders; el patrón `%texto%` se pasa como argumento para nombre e ID. Se conservan `trim`, coincidencia parcial, listado completo con filtro vacío y `ORDER BY id ASC`.

Evidencia: búsqueda de `d'agua` en un nombre con apóstrofo, filtro con espacios, búsqueda parcial por ID y texto `' OR 1=1 --`, que no altera la consulta ni devuelve equipos ajenos.

## Refactorización B — Activación confirmada por persistencia

Cambios realizados:
    Sobre los archivos: `src/viewmodel/usePlantViewModel.ts`, `src/data/localDb.ts` y `src/views/PlantScreen.tsx`.

Problema: `changeEnabled` cambiaba `items` antes de escribir y mantenía ese valor aunque fallara SQLite.

Evidencia: primero se espera `saveEquipmentState` y se verifica una fila actualizada. Solo entonces se cambia `enabled` con una actualización funcional y se bloquean los cambios repetidos mientras guarda.

Verificación ejecutada: dos llamadas inmediatas para el mismo ID producen una sola escritura; durante una escritura pendiente se conserva el valor anterior y el ID figura bloqueado. Se inyectó un rechazo, se comprobó que no hubiera confirmación falsa y luego se reintentó con éxito. También se comprobó que guardar un umbral no sobrescribiera un cambio de activación concurrente.

## Pendiente en Android/iOS y demostración al docente

Para reproducir: usar Node compatible con `engines`, ejecutar `npm ci`, `npm run typecheck`, `npm run verify` y `npm start`. Abrir en un cliente Expo compatible con SDK 58 o en una compilación nativa compatible.

Guion de comprobación manual:

1. Abrir, filtrar por código/nombre y probar un apóstrofo. Cambiar activación y comprobar que el Switch se bloquea hasta terminar.
2. Abrir Umbral y comprobar el valor precargado. Probar vacío, `12abc`, `0`, `151`, `NaN`, `Infinity`, `40.5` y `40,5`. Cancelar y verificar que no cambió. Guardar y verificar tarjeta y panel sin perder el filtro.
3. Guardar un límite igual a la temperatura actual: debe haber alarma si está activado. Desactivar: deben apagarse alarma de tarjeta, contador y color del panel. Probar también un límite inferior.
4. Consultar historial vacío, simular y reabrir: aparecen lecturas `simulación` en P-101/M-204. A-003 conserva su historial hasta una sincronización ambiental exitosa, que agrega `API ambiental`.
5. Generar más de 10 lecturas, confirmar orden y límite. Cambiar rápidamente entre historiales y comprobar aislamiento.
6. Cerrar y reabrir la aplicación sin borrar datos: deben conservarse umbral, activación e historial.
7. Comprobar acelerómetro y botón Actualizar dentro de la WebView.
8. Los fallos de escritura y el reintento ya se probaron con errores controlados; su presentación en un dispositivo queda pendiente. No borrar ni reinicializar la base para provocarlos.

## Uso de IA

Se utilizó Codex para implementar los cambios
Cloude para revisarlos y ejecutar las comprobaciones y documentar sus límites. El código mantiene las responsabilidades existentes y no agrega dependencias ni cambia el esquema.
