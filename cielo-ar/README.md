# 🌌 Cielo AR — Mapa del cielo en tu teléfono

PWA que muestra en tiempo real lo que hay en el cielo en la dirección a la que apuntas el teléfono: **planetas, estrellas brillantes, constelaciones, el Sol, la Luna y satélites** como la **Estación Espacial Internacional (ISS)**.

## ¿Cómo funciona?

1. Abre la app y pulsa **Comenzar** (concede permisos de sensores y ubicación).
2. Apunta el teléfono al cielo: verás los objetos que hay en esa dirección, con las líneas de las constelaciones y el horizonte con los puntos cardinales.
3. Para encontrar un satélite (ISS, Tiangong, Hubble) o cualquier otro objeto, selecciónalo en el desplegable **🔭 Buscar**: una **flecha amarilla** te indica hacia dónde mover el teléfono hasta tenerlo en pantalla.

Gestos: **pellizca** para hacer zoom (campo de visión), botón **🧭/👆** para alternar entre brújula y exploración manual arrastrando con el dedo (también funciona en escritorio con ratón y rueda).

## Características técnicas

- **100 % estático, sin build**: HTML + CSS + JavaScript vanilla. Se sirve desde cualquier hosting estático.
- **PWA instalable**: manifest + service worker con la app cacheada para funcionar sin conexión (los satélites necesitan red para refrescar datos, pero los TLE se guardan en `localStorage` y valen varios días).
- **Astronomía propia** (`js/astro.js`): posiciones planetarias con elementos keplerianos de Standish (JPL, 1800–2050), Luna con serie de Meeus truncada, tiempo sidéreo y conversión RA/Dec → azimut/altura. Precisión sobrada para observación a simple vista.
- **Satélites** (`js/satellites.js`): TLEs descargados de Celestrak y propagados con [satellite.js](https://github.com/shashwatak/satellite-js) (SGP4). Si la CDN o Celestrak fallan, la ISS usa la API de [wheretheiss.at](https://wheretheiss.at) como respaldo.
- **Catálogo** (`js/stars.js`): ~80 estrellas brillantes con nombre y 17 constelaciones/asterismos con sus líneas.
- **Orientación**: `deviceorientationabsolute` (Android) o `deviceorientation` + `webkitCompassHeading` (iOS, con solicitud de permiso). Si no hay sensores, modo manual automático.

## Cómo probarla

Los sensores y el GPS **requieren HTTPS** (o `localhost`). Opciones:

```bash
# Prueba local rápida
cd cielo-ar
python3 -m http.server 8080
# → http://localhost:8080 (en el móvil necesitarás HTTPS, p. ej. con un túnel)
```

La forma más sencilla de usarla en el teléfono es publicar la carpeta en **GitHub Pages**:
Settings → Pages → desplegar la rama, y abrir `https://<usuario>.github.io/<repo>/cielo-ar/`.
Después, desde el navegador del móvil: «Añadir a pantalla de inicio» para instalarla como app.

## Estructura

```
cielo-ar/
├── index.html            # UI: canvas, buscador, overlay de inicio
├── manifest.webmanifest  # Manifest PWA
├── sw.js                 # Service worker (offline)
├── css/styles.css
├── js/
│   ├── astro.js          # Cálculos astronómicos
│   ├── stars.js          # Catálogo de estrellas y constelaciones
│   ├── satellites.js     # ISS y satélites (TLE + SGP4)
│   └── app.js            # Cámara/sensores, render y flecha guía
└── icons/                # Iconos PWA
```
