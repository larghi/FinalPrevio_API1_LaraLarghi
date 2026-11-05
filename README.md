## Escenario

Recibís una aplicación para supervisar tres equipos simulados de una planta. La app contiene un panel híbrido, una capa de estado tipo MVVM, persistencia SQLite, lecturas del acelerómetro y una referencia ambiental obtenida mediante una API HTTP. El sistema inicia, muestra los equipos y permite simular lecturas.

Tu tarea consiste en **incorporar dos funcionalidades solicitadas** y **mejorar al menos dos decisiones técnicas del código existente** sin romper el funcionamiento inicial.

## Actividad 1 — Umbrales de alarma editables (30 puntos)

Actualmente el botón **Umbral** no tiene funcionalidad real. Implementá:

- Un formulario o diálogo asociado al **equipo seleccionado** para cambiar su límite de temperatura.
- Validación: número real **mayor que 0 y menor o igual a 150**. Un dato inválido no debe guardarse y debe informar al usuario.
- Persistencia del nuevo límite en **SQLite** (sobrevive al cierre y reapertura de la app).
- Actualización visible del límite y del estado de alarma. Un equipo se considera en alarma **solo si está activado** y `temperatura >= límite`.
- La modificación debe reflejarse también en el panel HTML embebido cuando corresponda.

## Actividad 2 — Historial de lecturas por equipo (30 puntos)

Actualmente el botón **Historial** es demostrativo. Implementá:

- Acceso al historial específico del equipo elegido.
- Lectura de los **últimos 10 registros** guardados en SQLite, ordenados del más nuevo al más antiguo.
- Mostrar, para cada registro, **fecha/hora, temperatura y origen**.
- Estado vacío claro si todavía no se registraron lecturas.
- El historial debe funcionar con las lecturas generadas por **Simular ciclo** y por **Sincronizar API**, y conservarse al reiniciar la app.

## Actividad 3 — Refactorización argumentada (25 puntos)

Identificá **al menos dos problemas diferentes** en el código existente (diseño, seguridad, asincronismo, manejo de errores, duplicación, testabilidad, responsabilidades u otros). Refactorizá dos de ellos conservando los comportamientos iniciales.

Documentá brevemente en `CAMBIOS.md`:

- problema observado y archivos afectados;
- cambio implementado y motivo;
- cómo verificaste que no rompiste el flujo original.

Se valora la **calidad de las decisiones** más que la cantidad de cambios. No se exige reorganizar por completo el repositorio.

## Actividad 4 — Verificación y entrega (15 puntos)

1. Ejecutar `npm run typecheck` sin errores derivados de los cambios (5 puntos).
2. Demostrar al docente el flujo **umbral + alarma** y el flujo **simulación/sincronización + historial** (8 puntos).
3. Entregar `CAMBIOS.md` y el proyecto modificado (2 puntos).

## Restricciones

- No eliminar ni reemplazar la app completa por un proyecto nuevo.
- No quitar el consumo HTTP, el almacenamiento SQLite, la lectura del sensor ni la WebView.
- No convertir la demostración local en control de hardware real.
- Se permite crear componentes, funciones y archivos nuevos.
- Se permite IA, pero debés comprender y poder explicar el código entregado. La cátedra puede solicitar una demostración y una breve justificación de las decisiones.
- La referencia HTTP es información ambiental pública; no se presume que sea una medición de planta.
