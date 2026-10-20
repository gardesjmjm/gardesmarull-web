#!/usr/bin/env node
// Construye el sitio completo en publicar/ (o en vista-previa/ con --vista-previa).
//   npm run build          → publicar/  (lo que se sube a Hostinger)
//   npm run vista-previa   → vista-previa/ (versión liviana con enlaces relativos)
import { readFile, readdir, rm, mkdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerSitio, leerProyectos, leerRedirecciones } from './lib/contenido.mjs';
import { Procesador } from './lib/imagenes.mjs';
import { crearPlantillas, EstilosGenerados } from './lib/plantillas.mjs';
import { htaccess, robots, sitemap, manifiesto, securityTxt, analytics } from './lib/servidor.mjs';
import { escribir, existe, hashCorto, enParalelo, ordenNatural, ErrorContenido } from './lib/util.mjs';

import { RAIZ, carpetaSalida, CACHE } from './lib/rutas.mjs';
const CONTENIDO = path.join(RAIZ, 'contenido');
const PLANTILLA = path.join(RAIZ, 'plantilla');
const modo = process.argv.includes('--vista-previa') ? 'vista-previa' : 'produccion';
const SALIDA = carpetaSalida(modo !== 'produccion');

const inicioReloj = Date.now();
const avisos = [];

async function copiarConHuella(origen, carpetaUrl, nombreBase) {
  const datos = await readFile(origen);
  const ext = path.extname(origen);
  const nombre = `${nombreBase}.${hashCorto(datos)}${ext}`;
  await escribir(path.join(SALIDA, ...carpetaUrl.split('/').filter(Boolean), nombre), datos);
  return carpetaUrl + nombre;
}

async function escribirConHuella(contenido, carpetaUrl, nombreBase, ext) {
  const nombre = `${nombreBase}.${hashCorto(contenido)}${ext}`;
  await escribir(path.join(SALIDA, ...carpetaUrl.split('/').filter(Boolean), nombre), contenido);
  return carpetaUrl + nombre;
}

function archivoDePagina(ruta) {
  if (ruta.endsWith('.html')) return path.join(SALIDA, ruta);
  return path.join(SALIDA, ...ruta.split('/').filter(Boolean), 'index.html');
}

async function tamanoCarpeta(dir) {
  let total = 0;
  let archivos = 0;
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      const sub = await tamanoCarpeta(ruta);
      total += sub.total;
      archivos += sub.archivos;
    } else {
      total += (await stat(ruta)).size;
      archivos++;
    }
  }
  return { total, archivos };
}

async function principal() {
  const sitio = await leerSitio(CONTENIDO);
  const proyectos = await leerProyectos(CONTENIDO, sitio, avisos);
  const redirecciones = await leerRedirecciones(CONTENIDO);

  // Se vacía la carpeta sin borrarla: así conserva la marca "ignorar" de Dropbox, si la tiene.
  await mkdir(SALIDA, { recursive: true });
  for (const entrada of await readdir(SALIDA)) await rm(path.join(SALIDA, entrada), { recursive: true, force: true });
  await mkdir(CACHE, { recursive: true });
  const procesador = new Procesador({ dirCache: CACHE, dirSalida: SALIDA, perfil: modo });

  // 1. Fotos de los proyectos
  const tareas = proyectos.flatMap((p) => p.fotos.map((foto) => ({ p, foto })));
  let hechas = 0;
  const chicas = new Map();
  const resultados = await enParalelo(tareas, 3, async ({ p, foto }) => {
    const img = await procesador.procesar(foto.ruta, p.ruta);
    hechas++;
    if (process.stdout.isTTY) process.stdout.write(`\r  Imágenes: ${hechas}/${tareas.length}`);
    const esChica = img.ratio >= 1 ? img.ancho < 1100 : img.ancho < 700;
    if (esChica) chicas.set(p.slug, [...(chicas.get(p.slug) || []), foto.archivo]);
    if (img.ancho > 4000) avisos.push(`${p.slug}/${foto.archivo}: mide ${img.ancho} px de ancho; conviene reducirla a 2500–3000 px antes de subirla (el sitio usa hasta 2048 px).`);
    return img;
  });
  if (process.stdout.isTTY) process.stdout.write('\n');
  for (const [slug, archivos] of chicas) {
    archivos.sort(ordenNatural);
    avisos.push(`${slug}: ${archivos.length} imagen(es) en baja resolución (${archivos.slice(0, 4).join(', ')}${archivos.length > 4 ? '…' : ''}). Se ven bien en celular; si tenés los originales, reemplazalas.`);
  }
  let k = 0;
  for (const p of proyectos) {
    p.imagenes = p.fotos.map((foto) => ({ foto, img: resultados[k++] }));
    // La portada va primero en la galería.
    const iPortada = p.imagenes.findIndex((x) => x.foto === p.portada);
    if (iPortada > 0) p.imagenes.unshift(...p.imagenes.splice(iPortada, 1));
    p.imgPortada = p.imagenes[0].img;
  }
  await enParalelo(proyectos, 3, async (p) => {
    p.og = await procesador.og(p.portada.ruta, p.ruta);
  });

  // 2. Imágenes e íconos del sitio
  const dirSitio = path.join(CONTENIDO, 'sitio');
  const imagenesSitio = {};
  if (await existe(path.join(dirSitio, 'estudio.jpg'))) imagenesSitio.estudio = await procesador.procesar(path.join(dirSitio, 'estudio.jpg'), '/img/');
  if (await existe(path.join(dirSitio, 'isotipo.png'))) {
    for (const [nombre, datos] of Object.entries(await procesador.iconos(path.join(dirSitio, 'isotipo.png')))) {
      await escribir(path.join(SALIDA, nombre), datos);
    }
  }

  // 3. Portadas de la página de inicio
  const destacados = proyectos.filter((p) => p.destacado);
  let portadas = sitio.portadas
    .map(({ foto, encuadre }) => {
      const [slug, archivo] = String(foto).split('/');
      const p = proyectos.find((x) => x.slug === slug);
      const item = p?.imagenes.find((x) => x.foto.archivo === archivo);
      if (!item) {
        avisos.push(`sitio.json → portadas: no encuentro «${foto}». La salteo.`);
        return null;
      }
      return { proyecto: p, img: item.img, encuadre: encuadre || '' };
    })
    .filter(Boolean);
  if (!portadas.length) portadas = destacados.slice(0, 3).map((p) => ({ proyecto: p, img: p.imgPortada, encuadre: p.encuadre }));

  // 4. Recursos estáticos con huella
  const recursos = {
    roboto: await copiarConHuella(path.join(PLANTILLA, 'fuentes', 'roboto.woff2'), '/fuentes/', 'roboto'),
    raleway: await copiarConHuella(path.join(PLANTILLA, 'fuentes', 'raleway-500.woff2'), '/fuentes/', 'raleway-500'),
    logo: await copiarConHuella(path.join(PLANTILLA, 'logo.svg'), '/img/', 'logo'),
    logoAncho: 718,
    logoAlto: 75,
    js: await copiarConHuella(path.join(PLANTILLA, 'sitio.js'), '/js/', 'sitio'),
    ga: sitio.google_analytics && modo === 'produccion' ? await escribirConHuella(analytics(sitio.google_analytics), '/js/', 'ga', '.js') : '',
    ogDefecto: portadas[0]?.proyecto.og || '',
    css: '/css/pendiente.css',
  };

  const jsonldEstudio = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': `${sitio.url}/#estudio`,
    name: sitio.nombre,
    url: `${sitio.url}/`,
    logo: `${sitio.url}/icono-512.png`,
    image: recursos.ogDefecto ? sitio.url + recursos.ogDefecto : undefined,
    description: sitio.descripcion,
    email: sitio.email,
    telephone: sitio.telefono_internacional,
    address: {
      '@type': 'PostalAddress',
      streetAddress: sitio.direccion,
      addressLocality: 'Ciudad Autónoma de Buenos Aires',
      addressRegion: 'CABA',
      addressCountry: 'AR',
    },
    areaServed: ['Ciudad Autónoma de Buenos Aires', 'Provincia de Buenos Aires'],
    foundingDate: '2015',
    founder: [
      { '@type': 'Person', name: 'Juan Manuel Gardes', jobTitle: 'Arquitecto' },
      { '@type': 'Person', name: 'Juan Manuel Marull', jobTitle: 'Arquitecto' },
    ],
    sameAs: Object.values(sitio.redes || {}),
  };

  // 5. Páginas (dos pasadas: la primera junta las reglas CSS que dependen del contenido)
  const estilos = new EstilosGenerados();
  const ctx = { sitio, proyectos, recursos, modo, estilos, portadas, imagenesSitio, jsonldEstudio };
  const renderizar = () => {
    const t = crearPlantillas(ctx);
    const paginas = [t.inicio(), t.indiceProyectos(), t.servicios(), t.nosotros(), t.contacto(), t.costos(), t.habmon()];
    proyectos.forEach((p, i) => {
      const anterior = proyectos[(i - 1 + proyectos.length) % proyectos.length];
      const siguiente = proyectos[(i + 1) % proyectos.length];
      paginas.push(t.paginaProyecto(p, anterior, siguiente));
    });
    if (modo === 'produccion') paginas.push(t.noEncontrada());
    return paginas;
  };
  renderizar();

  const cssBase = (await readFile(path.join(PLANTILLA, 'estilos.css'), 'utf8'))
    .replace('../fuentes/roboto.woff2', `..${recursos.roboto}`)
    .replace('../fuentes/raleway-500.woff2', `..${recursos.raleway}`);
  const css = `${cssBase}\n/* Generado a partir del contenido */\n${estilos.css()}\n`;
  recursos.css = await escribirConHuella(css, '/css/', 'estilos', '.css');

  const paginas = renderizar();
  for (const { ruta, html } of paginas) {
    let salida = html;
    if (modo === 'vista-previa' && ruta === '/') {
      // La vista previa como artifact agrega su propio <html>/<head>/<body>.
      salida = salida
        .replace(/<!doctype html>\s*/i, '')
        .replace(/<html[^>]*>\s*/i, '')
        .replace(/<\/?head>\s*/gi, '')
        .replace(/<body>\s*/i, '')
        .replace(/<\/body>\s*<\/html>\s*$/i, '')
        .replace(/<title>[^<]*<\/title>/, '<title>Sitio nuevo Gardes Marull</title>');
    }
    await escribir(archivoDePagina(ruta), salida);
  }

  // 6. Configuración del servidor y archivos para buscadores
  if (modo === 'produccion') {
    const resueltas = [];
    for (const r of redirecciones) {
      if (r.tipo === 'pagina') {
        resueltas.push(r);
        continue;
      }
      const [slug, archivo] = r.hacia.split('/');
      const p = proyectos.find((x) => x.slug === slug);
      const item = p?.imagenes.find((x) => x.foto.archivo === archivo);
      if (item) resueltas.push({ ...r, hacia: item.img.mayor });
      else if (p) resueltas.push({ ...r, tipo: 'foto', hacia: p.ruta });
    }
    await escribir(path.join(SALIDA, '.htaccess'), htaccess({ sitio, redirecciones: resueltas }));
    await escribir(path.join(SALIDA, 'robots.txt'), robots(sitio));
    const rutasIndexables = paginas.filter((x) => !/noindex/.test(x.html.slice(0, 3000))).map((x) => x.ruta);
    await escribir(path.join(SALIDA, 'sitemap.xml'), sitemap(sitio, rutasIndexables));
    await escribir(path.join(SALIDA, 'site.webmanifest'), manifiesto(sitio));
    await escribir(path.join(SALIDA, '.well-known', 'security.txt'), securityTxt(sitio));
    // Archivos que van tal cual a la raíz (por ejemplo, verificación de Google Search Console).
    const dirRaiz = path.join(CONTENIDO, 'raiz');
    if (await existe(dirRaiz)) {
      for (const archivo of await readdir(dirRaiz)) {
        if (archivo.startsWith('.')) continue;
        await copyFile(path.join(dirRaiz, archivo), path.join(SALIDA, archivo));
      }
    }
    const borrados = await procesador.limpiarCache();
    if (borrados) console.log(`  Caché: ${borrados} archivos viejos eliminados.`);
  } else {
    // En la vista previa también va el manifiesto (lo pide el <head>).
    await escribir(path.join(SALIDA, 'site.webmanifest'), manifiesto(sitio));
  }

  const { total, archivos } = await tamanoCarpeta(SALIDA);
  const segundos = ((Date.now() - inicioReloj) / 1000).toFixed(1);
  console.log(
    `✔ Sitio listo en ${SALIDA.startsWith(RAIZ) ? path.relative(RAIZ, SALIDA) + '/' : SALIDA} — ${paginas.length} páginas, ${proyectos.length} proyectos, ${archivos} archivos, ${(total / 1048576).toFixed(1)} MB (${segundos} s; ${procesador.generadas} imágenes nuevas, ${procesador.reutilizadas} de la caché).`
  );
  if (avisos.length) {
    console.log(`\nAvisos (${avisos.length}):`);
    for (const a of avisos) console.log(`  • ${a}`);
  }
}

principal().catch((error) => {
  if (error instanceof ErrorContenido) {
    console.error(`\n✖ ${error.message}\n`);
  } else {
    console.error('\n✖ Error inesperado al construir el sitio:\n', error);
  }
  process.exit(1);
});
