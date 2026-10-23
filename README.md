# gardesmarull.com.ar

Sitio estático del estudio: HTML, CSS y un poco de JavaScript, sin WordPress, sin base de datos y sin PHP.
Las páginas se generan a partir de la carpeta `contenido/` y se publican solas en Hostinger cada vez que se suben cambios a GitHub.

## Qué hay en cada carpeta

| Carpeta | Para qué sirve | ¿Se toca seguido? |
|---|---|---|
| `contenido/proyectos/` | Una carpeta por proyecto: `proyecto.txt` + fotos | **Sí** |
| `contenido/sitio.json` | Contacto, redes, fotos de portada del inicio, formulario | A veces |
| `contenido/redirecciones.txt` | Direcciones viejas → nuevas (para no perder Google) | Casi nunca |
| `contenido/sitio/` | Foto de Nosotros (`estudio.jpg`) e isotipo (`isotipo.png`, para los íconos) | Casi nunca |
| `contenido/raiz/` | Archivos que van tal cual a la raíz del sitio (por ejemplo, la verificación de Google Search Console) | Casi nunca |
| `plantilla/` | Diseño: estilos, logo, tipografías y comportamiento | No |
| `scripts/` | El generador del sitio | No |
| `formulario/` | Script opcional para recibir las consultas por email | Una vez |

## Agregar un proyecto

### Desde la compu (PowerShell, en `C:\Dropbox\gardesmarull-web`)

```powershell
npm run nuevo -- "Casa Las Lomas"
```

1. Eso crea `contenido/proyectos/casa-las-lomas/proyecto.txt`. Copiá ahí las fotos, numeradas: `01.jpg`, `02.jpg`, `03.jpg`… (un proyecto sin fotos no se publica).
2. Achicá los originales (no hace falta comprimirlas a mano): `npm run fotos -- casa-las-lomas`. Las deja en 3000 px como máximo y sin datos de la cámara; así el repositorio no se llena de fotos de 15 MB. Copiá las fotos a la carpeta, no las muevas: este paso modifica los archivos.
3. Completá los datos en `proyecto.txt` (lo que no sepas, dejalo vacío).
4. Miralo antes de publicar: `npm run dev` y abrí http://localhost:8080 (se actualiza solo cuando guardás cambios; recargá la página).
5. Publicalo:

```powershell
git add -A; if ($?) { git commit -m "Nuevo proyecto: Casa Las Lomas" }; if ($?) { git push }
```

En 2 o 3 minutos está en el sitio. El avance se ve en GitHub → pestaña **Actions**.

### Desde el navegador (sin instalar nada)

1. En GitHub, entrá a `contenido/proyectos` → **Add file → Create new file**.
2. En el nombre escribí `casa-las-lomas/proyecto.txt` (la barra crea la carpeta) y pegá el contenido de otra ficha, cambiando los datos.
3. **Commit changes**. Después entrá a la carpeta nueva → **Add file → Upload files** → arrastrá las fotos → **Commit changes**.

Se publica igual que desde la compu.

## La ficha `proyecto.txt`

```text
nombre: Casa Las Lomas
categoria: Viviendas            (Viviendas, Edificios o Institucional; se definen en sitio.json)
ubicacion: Pilar, Buenos Aires
año: 2026
superficie: 280 m²
rol: Proyecto y dirección de obra
estado: Terminado
desarrollo:                      (por ejemplo: Habitar, fideicomiso al costo)
fotografia:                      (crédito del fotógrafo)
orden: 5                         (más chico = más arriba; npm run nuevo lo pone primero)
destacado: si                    (si / no: si aparece en el inicio)
portada: 03.jpg                  (opcional: qué foto usar de tapa; si no, la primera)
encuadre: 50% 30%                (opcional: qué parte de la foto se ve cuando se recorta)
columna: angosta                 (opcional: forzar columna ancha o angosta en el inicio)
renders: si                      (opcional: todas las imágenes son renders)
---
Texto del proyecto, opcional, dos o tres líneas.
```

Las líneas que empiezan con `#` son comentarios y no se publican.

## Nombres de las fotos

- El número ordena: `01.jpg` va primero. Formatos: JPG, PNG o WEBP (las del iPhone en HEIC hay que exportarlas a JPG).
- Si el nombre tiene **render** (`08-render.jpg`), la imagen se marca como render y va al final, después de las fotos de obra.
- Lo que va después del número se usa como descripción: `04-patio-y-galeria.jpg` → «Patio y galería».
- Ideal: entre 2000 y 3000 px de ancho. El sitio genera solo las versiones livianas para celular y computadora, en AVIF y WebP, y les borra los datos de la cámara (incluida la ubicación GPS).

## Otras tareas

- **Cambiar las fotos grandes del inicio:** en `contenido/sitio.json`, la lista `portadas` (carpeta/archivo y encuadre).
- **Sacar un proyecto del inicio:** `destacado: no`. Sigue en la página Proyectos.
- **Borrar un proyecto:** borrá su carpeta y publicá. Si tenía una dirección conocida, agregá una línea en `redirecciones.txt` apuntando a `/proyectos/`.
- **Activar el envío por email del formulario:** ver `formulario/LEEME.md`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala lo necesario (solo la primera vez, o después de actualizar) |
| `npm run dev` | Construye el sitio y lo muestra en http://localhost:8080, reconstruyendo con cada cambio |
| `npm run build` | Construye el sitio en `publicar/` |
| `npm run verificar` | Revisa enlaces rotos, títulos, textos alternativos y redirecciones |
| `npm run nuevo -- "Nombre"` | Crea un proyecto nuevo |
| `npm run fotos -- carpeta` | Achica los originales de un proyecto (sin carpeta: todos) |

## Si la carpeta está en Dropbox

Cuando el proyecto está dentro de una carpeta de Dropbox, `publicar`, `vista-previa` y la caché de imágenes se generan fuera de Dropbox, en `%LOCALAPPDATA%\gardesmarull-web` (al compilar, el mensaje dice dónde). Así Dropbox no sincroniza cientos de archivos en cada cambio. Para elegir otra carpeta: variable de entorno `GM_CARPETA_TRABAJO`.

`node_modules` sí queda en Dropbox: son unos 160 archivos (30 MB) que cambian solo al instalar.

Usá Git desde una sola compu por vez: si otra persona va a publicar, que clone el repositorio en la suya en vez de trabajar sobre la carpeta compartida de Dropbox.

## Cómo se publica

1. Subís cambios a la rama `main` de GitHub (con `git push` o desde la web).
2. GitHub Actions construye el sitio, lo revisa y, si está todo bien, deja el resultado en la rama `sitio`.
3. Hostinger está conectado a la rama `sitio` y la copia a `public_html` automáticamente.

Si la revisión encuentra un error (una foto que falta, un enlace roto), la publicación se frena y el sitio anterior sigue online. El detalle del error aparece en GitHub → **Actions**.

## Seguridad

- El sitio no tiene nada que ejecute código en el servidor: no hay PHP, ni base de datos, ni panel de administración que atacar.
- El `.htaccess` fuerza HTTPS, bloquea archivos ocultos y cualquier PHP, y agrega las cabeceras de seguridad (CSP, HSTS, nosniff, etc.).
- Las acciones de GitHub están fijadas a versiones exactas y la publicación no guarda ninguna contraseña.
- Mantener activada la verificación en dos pasos en Hostinger, GitHub y Google.
