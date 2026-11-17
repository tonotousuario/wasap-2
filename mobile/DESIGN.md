---
name: Wasap móvil
description: Sátira cariñosa del mensajero verde cuya pantalla protagonista pasa lista; solo muestra lo que el servidor confirmó.
colors:
  primary: '#0A7C5A'
  onPrimary: '#FFFFFF'
  primarySoft: '#DDF3E9'
  onPrimarySoft: '#07513B'
  brand: '#1FCB6B'
  onBrand: '#04130D'
  bar: '#0A7C5A'
  onBar: '#FFFFFF'
  onBarSoft: '#E6F5EE'
  bg: '#FFFFFF'
  bgAlt: '#F2F5F3'
  chatBg: '#EEE9DF'
  surface: '#FFFFFF'
  line: '#E1E7E3'
  outline: '#74837C'
  text: '#111B17'
  textSoft: '#54645D'
  bubbleOwn: '#D7F8CF'
  bubbleOther: '#FFFFFF'
  onBubbleSoft: '#4C5E55'
  danger: '#B3261E'
  dangerSoft: '#FCE9E7'
  onDangerSoft: '#7A1A14'
  warnSoft: '#FFF0C7'
  onWarnSoft: '#5C3B00'
  neutralSoft: '#E7ECE9'
typography:
  display:
    fontFamily: 'system-ui (Roboto en Android, SF en iPhone)'
    fontSize: '34px'
    fontWeight: 700
    lineHeight: '40px'
  title:
    fontFamily: 'system-ui (Roboto en Android, SF en iPhone)'
    fontSize: '22px'
    fontWeight: 500
    lineHeight: '28px'
  heading:
    fontFamily: 'system-ui (Roboto en Android, SF en iPhone)'
    fontSize: '17px'
    fontWeight: 600
    lineHeight: '24px'
  body:
    fontFamily: 'system-ui (Roboto en Android, SF en iPhone)'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: '23px'
  label:
    fontFamily: 'system-ui (Roboto en Android, SF en iPhone)'
    fontSize: '15px'
    fontWeight: 600
    lineHeight: '20px'
  small:
    fontFamily: 'system-ui (Roboto en Android, SF en iPhone)'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: '20px'
  caption:
    fontFamily: 'system-ui (Roboto en Android, SF en iPhone)'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: '18px'
rounded:
  field: '8px'
  bubble: '14px'
  block: '16px'
  button: '24px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
  xxl: '32px'
components:
  button-filled:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.onPrimary}'
    typography: '{typography.label}'
    rounded: '{rounded.button}'
    padding: '8px 24px'
    height: '48px'
  button-filled-large:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.onPrimary}'
    typography: '{typography.heading}'
    rounded: '28px'
    padding: '8px 24px'
    height: '56px'
  button-filled-disabled:
    backgroundColor: '{colors.neutralSoft}'
    textColor: '{colors.textSoft}'
  button-tonal:
    backgroundColor: '{colors.primarySoft}'
    textColor: '{colors.onPrimarySoft}'
    typography: '{typography.label}'
    rounded: '{rounded.button}'
    padding: '8px 24px'
    height: '48px'
  button-text:
    backgroundColor: 'transparent'
    textColor: '{colors.primary}'
    typography: '{typography.label}'
    padding: '8px 12px'
    height: '48px'
  button-danger:
    backgroundColor: 'transparent'
    textColor: '{colors.danger}'
    typography: '{typography.label}'
    rounded: '{rounded.button}'
    padding: '8px 12px'
    height: '48px'
  field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.field}'
    padding: '10px 12px'
    height: '52px'
  chip:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    typography: '{typography.small}'
    rounded: '8px'
    padding: '0 16px'
    height: '36px'
  chip-selected:
    backgroundColor: '{colors.primarySoft}'
    textColor: '{colors.onPrimarySoft}'
    padding: '0 12px'
  top-bar:
    backgroundColor: '{colors.bar}'
    textColor: '{colors.onBar}'
    typography: '{typography.title}'
    height: '56px'
  tab-bar:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.textSoft}'
    height: '72px'
  tab-pill-selected:
    backgroundColor: '{colors.primarySoft}'
    textColor: '{colors.onPrimarySoft}'
    rounded: '{rounded.block}'
    padding: '4px 20px'
  notice-warn:
    backgroundColor: '{colors.warnSoft}'
    textColor: '{colors.onWarnSoft}'
    rounded: '{rounded.block}'
    padding: '12px 16px'
  notice-error:
    backgroundColor: '{colors.dangerSoft}'
    textColor: '{colors.onDangerSoft}'
    rounded: '{rounded.block}'
    padding: '12px 16px'
  notice-ok:
    backgroundColor: '{colors.primarySoft}'
    textColor: '{colors.onPrimarySoft}'
    rounded: '{rounded.block}'
    padding: '12px 16px'
  notice-info:
    backgroundColor: '{colors.neutralSoft}'
    textColor: '{colors.text}'
    rounded: '{rounded.block}'
    padding: '12px 16px'
  seal:
    backgroundColor: '{colors.brand}'
    textColor: '{colors.onBrand}'
    size: '24px'
  status-block-inside:
    backgroundColor: '{colors.primarySoft}'
    textColor: '{colors.onPrimarySoft}'
    typography: '{typography.display}'
    rounded: '20px'
    padding: '24px'
  status-block-neutral:
    backgroundColor: '{colors.neutralSoft}'
    textColor: '{colors.text}'
    typography: '{typography.display}'
    rounded: '20px'
    padding: '24px'
  bubble-own:
    backgroundColor: '{colors.bubbleOwn}'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.bubble}'
    padding: '7px 12px 6px'
  bubble-other:
    backgroundColor: '{colors.bubbleOther}'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.bubble}'
    padding: '7px 12px 6px'
  composer-input:
    backgroundColor: '{colors.bgAlt}'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '24px'
    padding: '12px 16px'
    height: '48px'
  send-button:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.onPrimary}'
    rounded: '24px'
    size: '48px'
  fab:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.onPrimary}'
    rounded: '{rounded.block}'
    size: '56px'
---

# Design System: Wasap móvil

Este documento registra el sistema tal como quedó construido en `mobile/src` (React Native / Expo, plataforma adaptativa). La fuente normativa de los valores es `mobile/src/ui/theme.ts`; los componentes viven en `mobile/src/ui/kit.tsx`. Las unidades `px` del encabezado son puntos independientes de densidad (dp en Android, pt en iPhone). Los valores del encabezado son los de **Android en esquema claro**, la única combinación capturada y revisada (emulador 360×640 dp, `.impeccable/review/mobile-android-*.png`). El sistema de la presentación (`DESIGN.md` en la raíz) es otro mundo y no aplica aquí.

**Estado de verificación**

- **Android claro:** construido y capturado. Es lo que este documento da por cierto.
- **Esquema oscuro:** `theme.ts` contiene una paleta oscura completa (verde carbón), pero nunca se ha renderizado ni revisado. No es normativa y sus valores no se repiten aquí. `mobile/app.config.ts` fija `userInterfaceStyle: 'light'`; en el emulador Android la app permaneció en claro con el sistema en modo oscuro. Activarla exige `automatic`, `expo-system-ui`, una compilación nativa y una revisión visual.
- **Rama iPhone:** escrita pero sin verificar: no existe compilación en macOS ni captura. Todo lo marcado «iPhone» en este documento es código leído, no pantalla vista.
- **Movimiento:** no hay ninguna animación propia.
- **Icono de la app y pantalla de arranque:** no existe recurso propio; el proyecto nativo conserva los predeterminados de la plantilla.

## Overview

**Creative North Star: "La palomita honesta"**

Wasap es una sátira cariñosa del mensajero verde: se ve y se usa como el chat que cualquier estudiante ya domina, pero su pantalla protagonista pasa lista. La familiaridad es deliberada (barra verde, burbujas con cola, fondo de chat color arena, botón flotante para chat nuevo) y la broma se dice en voz baja, en el texto: «Cualquier parecido con otro mensajero es pura coincidencia».

Lo que lo separa del original es una regla de honestidad. La interfaz solo afirma lo que el servidor confirmó. Un reloj significa «enviado, pendiente de confirmación»; una sola palomita significa «guardado por el servidor»; un sello verde brillante marca la asistencia confirmada. No hay doble palomita azul, ni «en línea», ni contadores de no leídos, porque el servidor no tiene esos datos.

La densidad es de herramienta de pasillo: una columna, una mano, luz de día, teléfono pequeño. Asistencia abre con un bloque de estado a todo el ancho y un botón de 56 de alto al alcance del pulgar; el resto son listas planas separadas por hilos.

**Key Characteristics:**

- Parodia reconocible del mensajero verde, con valores de color propios.
- Asistencia es la primera pestaña y la pantalla de entrada tras iniciar sesión.
- Estados honestos: reloj, palomita única, sello; nada inventado.
- Superficies planas y tonales; una sola sombra en todo el sistema.
- Tipografía e iconos del sistema operativo; ningún recurso gráfico propio.
- Todo estado lleva icono y palabra además de color.

## Colors

Una familia de verdes sobre blanco, con arena para el chat y tres superficies tonales (verde, ámbar, rojo pálidos) para los estados.

### Primary

- **Verde Wasap profundo** (`primary`, igual a `bar` en Android): superficie de la barra superior y de la acción principal (botón lleno, botón de enviar, botón flotante). Como tinta marca lo accionable o afirmativo: botones de texto, borde del campo enfocado, nombre del remitente en grupos, icono de entrada en el historial, casilla seleccionada.
- **Verde pálido** (`primarySoft` con `onPrimarySoft`): superficie tonal del estado «Dentro», del aviso de confirmación, del chip seleccionado, de la píldora de la pestaña activa, de los botones tonales y de la etiqueta «Creó el grupo».

### Secondary

- **Verde sello** (`brand` con `onBrand`): exclusivo del sello de confirmación del servidor. No aparece en ningún otro lugar de la app.

### Tertiary

- **Ámbar pálido** (`warnSoft` con `onWarnSoft`): «enviado, pendiente de confirmación», sin conexión y sesión vencida.
- **Rojo** (`danger`, `dangerSoft`, `onDangerSoft`): errores, borde del campo con problema, botón «Cerrar sesión» y quitar integrante.

### Neutral

- **Tinta** (`text`) y **tinta suave** (`textSoft`): texto principal y secundario. Son negros con un punto de verde, no gris neutro.
- **Blanco** (`bg`, `surface`, `bubbleOther`): fondo de pantallas, campos, barra de pestañas y burbuja recibida.
- **Niebla** (`bgAlt`): fondo de Ajustes, del panel de fechas, del compositor y de la fila de servidor.
- **Arena** (`chatBg`): fondo de toda conversación. Es el único fondo cálido.
- **Burbuja propia** (`bubbleOwn`) con **tinta de burbuja** (`onBubbleSoft`) para hora, palomita y rótulo de pendiente.
- **Hilo** (`line`): separadores de 1 y bordes de reposo. **Contorno** (`outline`): borde del campo y del chip sin seleccionar, borde punteado de lo no confirmado, iconos de estado vacío.
- **Gris tonal** (`neutralSoft`): estado «Fuera» o «Sin registros», botón deshabilitado, filas fantasma, franja de «conectando».

Seis pares de tono para avatares de personas están escritos directamente en `kit.tsx` y no en `theme.ts` (fondo/tinta): `#CDEFE0`/`#07513B`, `#D9E6FF`/`#1D3F8A`, `#FFE2C7`/`#7A3E00`, `#F1DAF7`/`#63257A`, `#FFD9DC`/`#8A1F2B`, `#E2EBC9`/`#3F5210`. Se eligen por el nombre, de forma estable. No tienen variante oscura.

### Named Rules

**Regla del verde reservado.** Como superficie, el verde profundo es solo para la barra y la acción principal. El estado nunca se pinta con él: usa una superficie tonal.

**Regla del sello.** El verde brillante existe únicamente dentro del sello y significa «el servidor lo confirmó». Si el servidor no respondió, no hay sello.

**Regla de nunca solo color.** Cada estado lleva icono y palabra. Propio y recibido se distinguen por lado, esquina, nombre y palomita; la pestaña activa, por píldora, icono relleno y negrita.

## Typography

**Display Font:** la del sistema (Roboto en Android, SF en iPhone)
**Body Font:** la misma
**Label/Mono Font:** no hay; las horas usan cifras tabulares de la fuente del sistema

**Character:** Ninguna fuente cargada. La voz tipográfica es la del teléfono, que es justo lo que hace creíble la parodia; la jerarquía sale del peso y de un único salto de tamaño grande.

### Hierarchy

- **Display** (700, 34/40): la palabra de estado de Asistencia («Dentro», «Fuera», «Sin datos», «Sin registros»). Un uso por pantalla.
- **Title** (500 en Android, 700 en iPhone; 22/28): título de la barra en las pestañas raíz (con interletrado 0.5 en Android) y nombre de la persona en Ajustes.
- **Heading** (600, 17/24): título de la barra en pantallas interiores, títulos de sección, nombre de conversación en la lista, rótulo del botón grande, título de estado vacío.
- **Body** (400, 16/23): texto de mensajes, campos, filas y líneas de estado. Sube a 500 o 600 para nombres en filas.
- **Label** (600, 15/20): rótulo de botón, etiqueta de campo, título de aviso, acciones de texto.
- **Small** (400, 14/20): cuerpo de avisos, detalle de filas, vista previa de mensajes, ayudas. Con 600 hace de encabezado de día y de texto de chip.
- **Caption** (400, 13/18): subtítulo de barra, ayuda y error de campo, hora en la lista, píldora de día en el chat.

Fuera de la escala de `theme.ts`, tal como está construido: la marca «Wasap» se compone en texto (800, interletrado 1; 40/46 en el acceso y 34 en el arranque) porque no existe logotipo; y un tamaño de 12/16 se repite en la etiqueta de pestaña, la hora de la burbuja y el rótulo «Pendiente de confirmación».

### Named Rules

**Regla de la escala del sistema.** El texto sigue el ajuste de tamaño de fuente del usuario. Solo se limita donde el alto es fijo: barra superior (hasta 1.4×), etiquetas de pestaña (hasta 1.3×) e iniciales de avatar (sin escalar, y ocultas a los lectores de pantalla).

**Regla de las cifras alineadas.** Toda hora en columna usa cifras tabulares: historial de asistencia y hora de burbuja.

## Layout

Una sola columna, solo vertical (la actividad Android está bloqueada en retrato). No hay puntos de quiebre ni variantes para tableta; se revisó a 360×640 dp y a 130 % de fuente.

- **Márgenes:** 16 a los lados en todas las pantallas; 24 en el acceso. Las listas van de borde a borde y cada fila lleva su propio relleno de 16.
- **Ritmo:** escala 4 · 8 · 12 · 16 · 24 · 32. Bloques de una pantalla separados por 16; grupos mayores (Ajustes, acceso) por 24.
- **Barra superior:** 56 de alto mínimo bajo el área segura, título a la izquierda. Bajo ella, cuando no hay conexión, una franja de estado de 36.
- **Navegación inferior:** tres pestañas (Asistencia · Chats · Ajustes), 72 de alto en Android, con hilo superior. Se oculta cuando el teclado está abierto.
- **Filas:** 72 mínimo en la lista de chats (avatar 48), 64 en filas de persona (avatar 44), 48 en filas del historial.
- **Objetivos táctiles:** 48 como mínimo en todo control, incluidos chips, acciones de aviso y botones de icono.
- **Chat:** lista invertida; burbujas de hasta el 84 % del ancho; 3 entre mensajes de la misma tanda y 8 al cambiar de remitente; compositor anclado abajo que crece hasta 132 de alto.
- **Acción principal al pulgar:** en Asistencia, el botón de 56 va inmediatamente bajo el bloque de estado; en «Crear grupo», anclado en una barra inferior.
- **Listas con botón flotante:** 96 de relleno inferior para que la última fila no quede tapada.

## Elevation & Depth

El sistema es plano. La profundidad se expresa con superficies tonales, hilos de 1 y el contraste arena/blanco del chat. No hay sombras de tarjeta, ni desenfoques, ni degradados.

### Shadow Vocabulary

- **Botón flotante** (`elevation: 4`, solo Android): la única sombra del sistema, en el botón de chat nuevo. Deshabilitado pierde la sombra (`elevation: 0`).

### Named Rules

**Regla del plano.** Si algo necesita separarse, primero un hilo o un cambio de superficie tonal. La única elevación pertenece al botón flotante.

## Shapes

Formas blandas y redondas, heredadas del mundo que parodia. Cuatro radios con nombre: campo (8), burbuja (14), bloque (16) y botón (24, píldora completa a 48 de alto). El botón grande de 56 usa 28 para seguir siendo píldora. Avatares, sello y botón de enviar son círculos.

Valores construidos fuera de esos cuatro: el bloque de estado de Asistencia usa 20; el chip usa 8; el compositor y las fichas de integrantes elegidos usan 24; la píldora de día y la marca de pendiente en Ajustes usan 8; la etiqueta de fila usa 6.

La burbuja lleva **cola**: en el primer mensaje de cada tanda, la esquina superior del lado del remitente baja a 3 y asoma un triángulo de 10 del mismo color. Los mensajes siguientes de la tanda son rectángulos redondeados sin cola.

**Regla de la línea punteada.** El borde punteado significa «todavía no es un hecho»: la burbuja enviada sin confirmar (1, contorno) y el bloque de estado cuando no se pudo consultar al servidor (2, contorno, sin relleno). Ningún otro elemento usa borde punteado.

## Components

Los iconos vienen de `@expo/vector-icons`: MaterialCommunityIcons en Android, Ionicons en iPhone. `kit.tsx` los asigna por significado (un nombre propio, dos glifos); las pantallas nunca nombran un glifo de una familia concreta. Tamaño base 24; 20–22 dentro de botones y avisos; 14 dentro de la burbuja. Las pestañas alternan contorno (inactiva) y relleno (activa).

Respuesta al toque: onda nativa en Android; opacidad reducida en iPhone. No hay transiciones entre pantallas ni animaciones de entrada: los cambios son instantáneos. El único movimiento es el del sistema (onda, indicador de actividad, deslizar para actualizar, teclado).

### Buttons

- **Shape:** píldora (24 de radio a 48 de alto mínimo; 28 a 56 en la variante grande).
- **Lleno:** verde profundo con texto blanco, relleno horizontal de 24. Uno por pantalla: «Registrar entrada/salida», «Entrar», «Crear grupo». La variante grande usa texto Heading e icono de 24.
- **Tonal:** verde pálido con tinta verde oscura. Acciones secundarias: «Ver este periodo», «Ver registros anteriores», «Sincronizar ahora».
- **Texto:** sin fondo, tinta verde profundo, relleno horizontal de 12.
- **Peligro:** sin fondo, borde y tinta rojos de 1. Solo «Cerrar sesión».
- **Deshabilitado:** lleno y tonal pasan a gris tonal con tinta suave, siempre legibles; texto y peligro bajan a 50 % de opacidad. Junto al botón se escribe la causa («Sin conexión. Podrás registrar cuando vuelva.»).
- **Cargando:** el icono se sustituye por un indicador de actividad y el rótulo cambia a gerundio («Enviando…»).
- **Botón de icono:** área de 48×48 sin fondo, con etiqueta accesible obligatoria.
- **Botón flotante (Android):** cuadrado redondeado de 56 (radio 16), verde profundo, abajo a la derecha de la lista de chats.

### Chips

- **Style:** píldora visual de 36 dentro de un área táctil de 48, radio 8, borde de 1 en contorno, fondo transparente, texto Small en 600.
- **State:** seleccionado pasa a verde pálido, pierde el contraste de borde y antepone una palomita de 18. Funcionan como grupo de opción única (filtros de periodo y de tipo de conversación), en fila con desplazamiento horizontal.

### Cards / Containers

No hay tarjetas apiladas. Los contenedores son bloques tonales o grupos con hilo.

- **Bloque de estado (Asistencia):** a todo el ancho, radio 20, relleno 24. Icono de 36 más palabra en Display, línea con el último movimiento y nota de hora del servidor. «Dentro» confirmado: verde pálido con sello de 36. «Fuera» y «Sin registros»: gris tonal con icono. «Sin datos»: sin relleno, borde punteado.
- **Aviso en línea:** bloque tonal de radio 16 con icono, título, causa y, si aplica, una acción subrayada o un botón de cerrar. Cuatro tonos: error (rojo pálido, icono de alerta), pendiente (ámbar pálido, reloj), confirmado (verde pálido, sello) e informativo (gris tonal).
- **Grupo de Ajustes:** superficie blanca de radio 16 sobre fondo niebla, filas separadas por un hilo sangrado 16.
- **Franja de conexión:** barra de 36 a todo el ancho bajo la barra superior. Ámbar pálido con icono cuando no hay conexión; gris tonal con indicador mientras conecta.

### Inputs / Fields

- **Style:** etiqueta siempre visible encima (Label), caja de 52 de alto mínimo, radio 8, borde de 1 en contorno, fondo blanco. Admite un elemento a la derecha (lupa, borrar).
- **Focus:** el borde pasa a 2 en verde profundo; el relleno se compensa en 1 para que el texto no salte.
- **Error:** borde de 2 en rojo y mensaje en Caption rojo bajo el campo, que sustituye a la ayuda.
- **Compositor de mensaje:** campo de varias líneas en niebla con radio 24 y borde de hilo, junto a un botón de enviar circular de 48. El botón es verde profundo cuando se puede enviar y gris tonal cuando no; la causa del bloqueo se escribe sobre el compositor. El contador aparece solo en los últimos 400 de 4000 caracteres.

### Navigation

- **Barra superior:** verde profundo con texto blanco, título a la izquierda (Title en pestañas raíz, Heading en interiores), subtítulo en Caption, flecha de volver y acciones a la derecha. En un chat lleva el avatar de 38 junto al título.
- **Barra de pestañas:** superficie blanca con hilo superior. Pestaña activa: píldora verde pálido tras el icono relleno y etiqueta en 700. Inactiva: icono de contorno y etiqueta en 500, en tinta suave.
- **Pila:** las pantallas interiores (chat, integrantes, nuevo chat, crear grupo, servidor) reemplazan a las pestañas completas; el botón físico de atrás retrocede un nivel.

### Burbujas y la palomita honesta

El componente firma. Tres estados y ninguno más:

- **Pendiente:** burbuja del lado propio con borde punteado, reloj de 14 y el rótulo «Pendiente de confirmación». En Asistencia y en el resto de operaciones, el mismo estado es un aviso ámbar con reloj y el título «Enviado, pendiente de confirmación».
- **Guardado:** burbuja propia verde pálido con hora y **una** palomita de 14 en tinta de burbuja. La palomita nunca cambia de color ni se duplica.
- **Confirmado (asistencia):** sello circular verde brillante con palomita oscura, de 24 en avisos y 36 en el bloque de estado.

Las burbujas recibidas son blancas, a la izquierda, con el nombre del remitente en verde profundo (Small, 700) al inicio de cada tanda en grupos y en el chat general. Los días se separan con una píldora blanca centrada.

### Avatares, filas y vacíos

- **Avatar:** círculo. Personas: iniciales sobre uno de seis tonos. Grupos y chat general: icono; el general siempre en verde pálido.
- **Fila de persona:** avatar 44, nombre en Body 500, matrícula en Small, etiqueta opcional y acción a la derecha.
- **Estado vacío:** icono de 36 en contorno, título Heading y una línea que dice qué hacer, centrados.
- **Carga inicial:** filas fantasma en gris tonal, estáticas.

### Rama iPhone (sin verificar)

El código define, y nadie ha visto en pantalla: barra superior blanca con tinta oscura, hilo inferior y flecha de volver en verde; barra de pestañas de 54 sin píldora, con la activa teñida de verde profundo; radios de campo 10 y de botón 12; chip de radio 20; en la lista de chats, dos botones tonales («Mensaje privado», «Crear grupo») en lugar del botón flotante; una franja de 22 en el borde izquierdo que vuelve atrás al deslizar; grupos de Ajustes con borde de hilo. Aún no implementa título grande que se contrae ni transiciones nativas de navegación.

## Do's and Don'ts

### Do:

- **Do** mostrar el sello o la palomita solo con la respuesta del servidor en la mano; mientras tanto, reloj y «pendiente de confirmación».
- **Do** dar a cada estado icono, palabra y superficie tonal a la vez.
- **Do** mantener el verde profundo como superficie de la barra y de una sola acción principal por pantalla.
- **Do** escribir la causa junto a un control bloqueado y conservar lo que el usuario ya escribió.
- **Do** tomar color, tipo, espaciado y radio de `theme.ts`, y pedir los iconos por significado a través de `kit.tsx`.
- **Do** respetar 48 como objetivo táctil mínimo y dejar que el texto siga la escala de fuente del sistema.
- **Do** separar con hilos y superficies tonales antes que con sombras.
- **Do** tratar la rama iPhone y la paleta oscura como pendientes de verificación hasta que exista una captura.

### Don't:

- **Don't** usar doble palomita, palomita azul, «visto», «en línea», «escribiendo…» ni contadores de no leídos: el servidor no tiene esos datos.
- **Don't** pintar un estado con el verde profundo ni usar el verde brillante fuera del sello.
- **Don't** asumir un estado que el servidor no dio: sin respuesta se muestra «Sin datos», no «Fuera».
- **Don't** usar borde punteado para decorar; significa «sin confirmar».
- **Don't** cargar fuentes propias ni mezclar las dos familias de iconos en una misma plataforma.
- **Don't** apilar tarjetas idénticas con sombra; las listas son filas planas con hilo.
- **Don't** copiar logotipos, nombres o recursos del mensajero original: la parodia vive en el color, la forma y el texto.
