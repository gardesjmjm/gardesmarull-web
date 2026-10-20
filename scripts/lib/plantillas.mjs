// Plantillas HTML del sitio. Todo el texto dinámico pasa por esc() antes de llegar al HTML.
import path from 'node:path';
import { esc, hashCorto, jsonParaScript } from './util.mjs';

/** Reglas CSS que dependen del contenido (colores de espera, encuadres, proporciones, orden). */
export class EstilosGenerados {
  constructor() {
    this.reglas = new Map();
  }
  color(img) {
    const c = `c-${img.id.slice(0, 8)}`;
    this.reglas.set(c, `.${c}{background-color:${img.color}}`);
    return c;
  }
  encuadre(valor) {
    if (!valor) return '';
    const c = `e-${hashCorto(valor, 6)}`;
    this.reglas.set(c, `.${c} img{object-position:${valor}}`);
    return c;
  }
  proporcion(ratio) {
    const v = Math.round(ratio * 100) / 100;
    const c = `p-${String(v).replace('.', '_')}`;
    this.reglas.set(c, `.${c} img{aspect-ratio:${v};object-fit:cover}`);
    return c;
  }
  flex(ratio) {
    const v = Math.round(ratio * 100);
    const c = `f-${v}`;
    this.reglas.set(c, `@media (min-width:601px){.${c}{flex:${v} 1 0}}`);
    return c;
  }
  orden(n) {
    const c = `o-${n}`;
    this.reglas.set(c, `.${c}{order:${n}}`);
    return c;
  }
  css() {
    return [...this.reglas.values()].join('\n');
  }
}

/** Devuelve u(ruta): en producción, rutas absolutas; en vista previa, rutas relativas a la página actual. */
export function crearU(paginaActual, modo) {
  return (destino) => {
    if (!destino || /^(https?:|mailto:|tel:|#|data:)/.test(destino)) return destino;
    if (modo !== 'vista-previa') return destino;
    let [ruta, fragmento] = destino.split('#');
    if (ruta.endsWith('/')) ruta += 'index.html';
    const dirActual = paginaActual.endsWith('/') ? paginaActual : path.posix.dirname(paginaActual) + '/';
    const relativa = path.posix.relative(dirActual, ruta) || 'index.html';
    return relativa + (fragmento ? `#${fragmento}` : '');
  };
}

const srcset = (lista, u) => lista.map((v) => `${esc(u(v.url))} ${v.ancho}w`).join(', ');

// Ancho que ocupa la imagen de portada (dentro de los márgenes de la página).
const TAM_PORTADA = '(min-width: 1310px) 1180px, calc(100vw - 2 * clamp(16px, 5vw, 64px))';

export function crearPlantillas(ctx) {
  const { sitio, proyectos, recursos, modo, estilos } = ctx;
  const anio = new Date().getFullYear();
  const wsp = `https://wa.me/${sitio.whatsapp}?text=${encodeURIComponent(sitio.whatsapp_mensaje || 'Hola')}`;
  const wspProyecto = (nombre) =>
    `https://wa.me/${sitio.whatsapp}?text=${encodeURIComponent(`Hola, vi el proyecto ${nombre} en gardesmarull.com.ar y quería consultarles por uno parecido.`)}`;

  function imagen(img, { u, sizes, alt, cargar = 'lazy', prioridad = false, claseImg = '' }) {
    const fuentes = img.variantes.avif ? `<source type="image/avif" srcset="${srcset(img.variantes.avif, u)}" sizes="${sizes}">` : '';
    const webp = img.variantes.webp;
    const src = webp[Math.min(1, webp.length - 1)].url;
    const atributos = [
      `src="${esc(u(src))}"`,
      `srcset="${srcset(webp, u)}"`,
      `sizes="${sizes}"`,
      `width="${img.ancho}"`,
      `height="${img.alto}"`,
      `alt="${esc(alt)}"`,
      cargar === 'lazy' ? 'loading="lazy"' : '',
      'decoding="async"',
      prioridad ? 'fetchpriority="high"' : '',
      claseImg ? `class="${claseImg}"` : '',
    ].filter(Boolean);
    return `<picture>${fuentes}<img ${atributos.join(' ')}></picture>`;
  }

  const datoCorto = (p) => [p.categoria.nombre, p.ano].filter(Boolean).join(' · ');

  function altFoto(p, foto, i, total) {
    const base = foto.leyenda ? `${p.nombre}: ${foto.leyenda.toLowerCase()}` : `${p.nombre}, imagen ${i + 1} de ${total}`;
    return foto.esRender ? `${base} (render)` : base;
  }

  // ---------- Documento base ----------
  function documento({ ruta, titulo, descripcion, cuerpo, og, noindex = false, jsonld = [], precargas = '', seccion = '', llamado = true, tituloLlamado }) {
    const u = crearU(ruta, modo);
    const canonical = sitio.url + ruta;
    const imagenOg = og || recursos.ogDefecto;
    const enlaceMenu = (destino, texto) => {
      const actual = ruta === destino ? ' aria-current="page"' : seccion === destino ? ' aria-current="true"' : '';
      return `<li><a href="${esc(u(destino))}"${actual}>${texto}</a></li>`;
    };
    const ga =
      sitio.google_analytics && modo === 'produccion'
        ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(sitio.google_analytics)}"></script>\n<script src="${esc(u(recursos.ga))}"></script>`
        : '';
    const redes = Object.entries(sitio.redes || {})
      .map(([nombre, url]) => `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(nombre)}</a></li>`)
      .join('');

    const bloqueLlamado = llamado
      ? `
<section class="llamado" aria-labelledby="t-llamado">
  <div class="envoltura">
    <h2 id="t-llamado" class="llamado__titulo">${esc(tituloLlamado?.titulo || '¿Tenés un proyecto?')}</h2>
    <p class="llamado__texto">${esc(tituloLlamado?.texto || 'Contanos qué tenés en mente: un terreno, una reforma, una obra nueva o un modelado BIM.')}</p>
    <div class="llamado__acciones">
      <a class="boton" href="${esc(tituloLlamado?.wsp || wsp)}" target="_blank" rel="noopener noreferrer">Escribinos por WhatsApp</a>
      <a class="enlace-flecha" href="${esc(u('/contacto/'))}">O completá el formulario</a>
    </div>
  </div>
</section>`
      : '';

    return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
${noindex ? '<meta name="robots" content="noindex, follow">' : `<link rel="canonical" href="${esc(canonical)}">`}
<meta property="og:type" content="website">
<meta property="og:locale" content="es_AR">
<meta property="og:site_name" content="${esc(sitio.nombre)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${esc(canonical)}">
${imagenOg ? `<meta property="og:image" content="${esc(sitio.url + imagenOg)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
<link rel="preload" href="${esc(u(recursos.roboto))}" as="font" type="font/woff2" crossorigin>
${precargas ? precargas(u) : ''}
<link rel="stylesheet" href="${esc(u(recursos.css))}">
<link rel="icon" href="${esc(u('/favicon.ico'))}" sizes="32x32">
<link rel="icon" href="${esc(u('/icono-192.png'))}" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="${esc(u('/apple-touch-icon.png'))}">
<link rel="manifest" href="${esc(u('/site.webmanifest'))}">
<script src="${esc(u(recursos.js))}" defer></script>
${ga}
${jsonld.map((j) => `<script type="application/ld+json">${jsonParaScript(j)}</script>`).join('\n')}
</head>
<body>
<a class="saltar" href="#contenido">Saltar al contenido</a>
<header class="cabecera">
  <div class="envoltura cabecera__fila">
    <a class="logo" href="${esc(u('/'))}"><img src="${esc(u(recursos.logo))}" width="${recursos.logoAncho}" height="${recursos.logoAlto}" alt="${esc(sitio.nombre)}"></a>
    <nav class="menu" aria-label="Principal">
      <ul>
        ${enlaceMenu('/proyectos/', 'Proyectos')}
        ${enlaceMenu('/servicios/', 'Servicios')}
        ${enlaceMenu('/nosotros/', 'Nosotros')}
        ${enlaceMenu('/contacto/', 'Contacto')}
      </ul>
    </nav>
  </div>
</header>
<main id="contenido">
${cuerpo}
${bloqueLlamado}
</main>
<footer class="pie">
  <div class="envoltura">
    <div class="pie__grilla">
      <div>
        <p class="etiqueta">Estudio</p>
        <p>${esc(sitio.direccion)}<br>${esc(sitio.localidad)}</p>
        <p><a href="${esc(sitio.mapa)}" target="_blank" rel="noopener noreferrer">Ver en el mapa</a></p>
      </div>
      <div>
        <p class="etiqueta">Contacto</p>
        <p><a href="mailto:${esc(sitio.email)}">${esc(sitio.email)}</a><br><a href="${esc(wsp)}" target="_blank" rel="noopener noreferrer">WhatsApp ${esc(sitio.telefono)}</a></p>
      </div>
      <div>
        <p class="etiqueta">Redes</p>
        <ul class="pie__redes">${redes}</ul>
      </div>
    </div>
    <p class="pie__legal"><span>© ${anio} ${esc(sitio.nombre)}</span><span>Matriculados en CABA y Provincia de Buenos Aires</span><a href="${esc(u('/costos/'))}">Costos de obra</a></p>
  </div>
</footer>
<a class="flotante" href="${esc(wsp)}" target="_blank" rel="noopener noreferrer" aria-label="Escribinos por WhatsApp"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 3.5c-4.7 0-8.5 3.5-8.5 7.8 0 2.4 1.2 4.6 3.1 6l-.8 3.2 3.4-1.8c.9.3 1.8.4 2.8.4 4.7 0 8.5-3.5 8.5-7.8S16.7 3.5 12 3.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><span>WhatsApp</span></a>
</body>
</html>
`;
  }

  // ---------- Piezas ----------
  function tarjetaMosaico(p, r, ordenGlobal, columna, u) {
    const img = p.imgPortada;
    const recorte = Math.abs(r - img.ratio) > 0.01 ? estilos.proporcion(r) : '';
    const clases = ['tarjeta__imagen', estilos.color(img), recorte, estilos.encuadre(p.encuadre)].filter(Boolean).join(' ');
    const sizes = columna === 'ancha' ? '(min-width: 760px) min(61vw, 720px), calc(100vw - 32px)' : '(min-width: 760px) min(33vw, 390px), calc(100vw - 32px)';
    return `<article class="tarjeta ${estilos.orden(ordenGlobal)}">
  <a class="tarjeta__enlace" href="${esc(u(p.ruta))}">
    <div class="${clases}">${imagen(img, { u, sizes, alt: p.nombre })}</div>
    <h3 class="tarjeta__nombre">${esc(p.nombre)}</h3>
    <p class="tarjeta__dato">${esc(datoCorto(p))}</p>
  </a>
</article>`;
  }

  /** Reparte los proyectos destacados en dos columnas (ancha/angosta) equilibrando alturas. */
  function repartir(lista) {
    const ANCHA = 0.61;
    const ANGOSTA = 0.33;
    const EXTRA = 0.07; // nombre + separación, relativo al ancho del contenedor
    let altoA = 0;
    let altoB = 0.1; // la columna angosta arranca más abajo
    const a = [];
    const b = [];
    lista.forEach((p, i) => {
      const r = Math.min(Math.max(p.imgPortada.ratio, 0.5), 1.9);
      const hA = ANCHA / r + EXTRA;
      const hB = ANGOSTA / r + EXTRA;
      let angosta;
      if (p.columna) angosta = p.columna === 'angosta';
      else {
        angosta = r < 1.05;
        const difPreferida = angosta ? Math.abs(altoA - (altoB + hB)) : Math.abs(altoA + hA - altoB);
        const difOtra = angosta ? Math.abs(altoA + hA - altoB) : Math.abs(altoA - (altoB + hB));
        if (difPreferida > difOtra + 0.35) angosta = !angosta;
      }
      if (angosta) {
        b.push({ p, r, i });
        altoB += hB;
      } else {
        a.push({ p, r, i });
        altoA += hA;
      }
    });
    return { a, b };
  }

  // ---------- Páginas ----------
  function inicio() {
    const ruta = '/';
    const u = crearU(ruta, modo);
    const portadas = ctx.portadas;
    const [primera, ...resto] = portadas;
    const itemPortada = (pt, i) => {
      const clases = ['portada__item', i === 0 ? 'es-activa' : '', estilos.color(pt.img), estilos.encuadre(pt.encuadre)].filter(Boolean).join(' ');
      return `<a class="${clases}" href="${esc(u(pt.proyecto.ruta))}" data-nombre="${esc(pt.proyecto.nombre)}" tabindex="${i === 0 ? '0' : '-1'}">${imagen(pt.img, {
        u,
        sizes: TAM_PORTADA,
        alt: pt.proyecto.nombre,
        cargar: i === 0 ? 'eager' : 'lazy',
        prioridad: i === 0,
      })}</a>`;
    };
    const destacados = proyectos.filter((p) => p.destacado);
    const { a, b } = repartir(destacados);
    const columna = (lista, tipo) => lista.map(({ p, r, i }) => tarjetaMosaico(p, r, i + 1, tipo, u)).join('\n');

    const cuerpo = `
<section class="portada envoltura" aria-label="Obras del estudio">
  <div class="portada__marco" data-portada>
    ${itemPortada(primera, 0)}
    ${resto.length ? `<template data-portada-mas>${resto.map((pt, i) => itemPortada(pt, i + 1)).join('')}</template>` : ''}
  </div>
  <div class="portada__pie">
    <a class="portada__proyecto" href="${esc(u(primera.proyecto.ruta))}" data-portada-pie>${esc(primera.proyecto.nombre)}</a>
    ${resto.length ? '<button class="portada__pausa" type="button" data-portada-pausa hidden aria-pressed="false">Pausar</button>' : ''}
  </div>
</section>
<section class="presentacion envoltura">
  <p class="etiqueta">Proyecto · Dirección de obra · Modelado BIM</p>
  <h1 class="declaracion">${esc(sitio.lema)}</h1>
  <p class="presentacion__texto">${esc(sitio.presentacion)}</p>
</section>
<section class="destacados envoltura" aria-labelledby="t-destacados">
  <h2 id="t-destacados" class="titular">Proyectos<br>destacados</h2>
  <div class="mosaico">
    <div class="mosaico__col mosaico__col--ancha">
${columna(a, 'ancha')}
    </div>
    <div class="mosaico__col mosaico__col--angosta">
${columna(b, 'angosta')}
    </div>
  </div>
  <p class="destacados__mas"><a class="enlace-flecha" href="${esc(u('/proyectos/'))}">Ver todos los proyectos</a></p>
</section>
<section class="servicios-breve envoltura" aria-labelledby="t-servicios">
  <h2 id="t-servicios" class="etiqueta">Servicios</h2>
  <ul class="servicios-breve__lista">
    <li><a href="${esc(u('/servicios/#proyecto'))}">Proyecto</a></li>
    <li><a href="${esc(u('/servicios/#direccion'))}">Dirección de obra</a></li>
    <li><a href="${esc(u('/servicios/#bim'))}">Modelado BIM</a></li>
    <li><a href="${esc(u('/servicios/#desarrollos'))}">Desarrollos</a></li>
  </ul>
</section>`;

    const precargaPortada = (u2) => {
      const img = primera.img;
      const formato = img.variantes.avif ? 'avif' : 'webp';
      const lista = img.variantes[formato];
      const href = lista[Math.min(1, lista.length - 1)].url;
      return `<link rel="preload" as="image" type="image/${formato}" href="${esc(u2(href))}" imagesrcset="${srcset(lista, u2)}" imagesizes="${TAM_PORTADA}" fetchpriority="high">`;
    };

    return {
      ruta,
      html: documento({
        ruta,
        titulo: sitio.titulo_inicio || sitio.nombre,
        descripcion: sitio.descripcion,
        cuerpo,
        og: primera.proyecto.og,
        precargas: precargaPortada,
        jsonld: [ctx.jsonldEstudio],
      }),
    };
  }

  function indiceProyectos() {
    const ruta = '/proyectos/';
    const u = crearU(ruta, modo);
    const conteo = (slug) => proyectos.filter((p) => p.categoria.slug === slug).length;
    const categorias = sitio.categorias.filter((c) => conteo(c.slug) > 0);
    const filtros = [
      `<button type="button" data-filtro="todos" aria-pressed="true">Todos <span>${proyectos.length}</span></button>`,
      ...categorias.map((c) => `<button type="button" data-filtro="${esc(c.slug)}" aria-pressed="false">${esc(c.nombre)} <span>${conteo(c.slug)}</span></button>`),
    ].join('\n      ');
    const tarjetas = proyectos
      .map((p) => {
        const img = p.imgPortada;
        const clases = ['tarjeta__imagen', estilos.color(img), estilos.proporcion(4 / 3), estilos.encuadre(p.encuadre)].filter(Boolean).join(' ');
        return `<li class="tarjeta" data-categoria="${esc(p.categoria.slug)}">
  <a class="tarjeta__enlace" href="${esc(u(p.ruta))}">
    <div class="${clases}">${imagen(img, { u, sizes: '(min-width: 1100px) 372px, (min-width: 700px) 45vw, calc(100vw - 32px)', alt: p.nombre })}</div>
    <h2 class="tarjeta__nombre">${esc(p.nombre)}</h2>
    <p class="tarjeta__dato">${esc([p.categoria.nombre, p.ubicacion, p.ano].filter(Boolean).join(' · '))}</p>
  </a>
</li>`;
      })
      .join('\n');
    const cuerpo = `
<section class="envoltura encabezado">
  <h1 class="titular">Proyectos</h1>
  <div class="filtros" data-filtros role="group" aria-label="Filtrar por categoría" hidden>
      ${filtros}
  </div>
</section>
<section class="envoltura">
  <ul class="indice" data-indice>
${tarjetas}
  </ul>
</section>`;
    return {
      ruta,
      html: documento({
        ruta,
        titulo: `Proyectos | ${sitio.nombre}`,
        descripcion: `Viviendas, edificios y obras institucionales de ${sitio.nombre}: proyecto, dirección de obra y modelado BIM en Buenos Aires.`,
        cuerpo,
        seccion: '/proyectos/',
        jsonld: [migas([{ nombre: 'Proyectos', ruta }])],
      }),
    };
  }

  function migas(items) {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [{ nombre: 'Inicio', ruta: '/' }, ...items].map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: it.nombre,
        item: sitio.url + it.ruta,
      })),
    };
  }

  function filasGaleria(p, u) {
    const total = p.imagenes.length;
    const filas = [];
    let separadorPuesto = false;
    const hayFotos = p.imagenes.some((x) => !x.foto.esRender);
    let i = 0;
    const figura = (item, idx, { sizes, flex = '' }) => {
      const { img, foto } = item;
      const leyenda = foto.leyenda ? `<figcaption>${esc(foto.leyenda)}</figcaption>` : '';
      const datosVisor = [
        `data-visor`,
        `data-webp="${srcset(img.variantes.webp, u)}"`,
        img.variantes.avif ? `data-avif="${srcset(img.variantes.avif, u)}"` : '',
        `data-ancho="${img.ancho}"`,
        `data-alto="${img.alto}"`,
      ]
        .filter(Boolean)
        .join(' ');
      const clases = ['galeria__foto', flex].filter(Boolean).join(' ');
      return `<figure class="${clases}"><a class="galeria__enlace ${estilos.color(img)}" href="${esc(u(img.mayor))}" ${datosVisor}>${imagen(img, {
        u,
        sizes,
        alt: altFoto(p, foto, idx, total),
        cargar: idx === 0 ? 'eager' : 'lazy',
        prioridad: idx === 0,
      })}</a>${leyenda}</figure>`;
    };
    const completa = '(min-width: 1310px) 1180px, calc(100vw - 2 * clamp(16px, 5vw, 64px))';
    const media = '(min-width: 1310px) 580px, (min-width: 601px) 46vw, calc(100vw - 32px)';
    while (i < total) {
      const actual = p.imagenes[i];
      if (hayFotos && actual.foto.esRender && !separadorPuesto) {
        filas.push('<p class="galeria__separador etiqueta">Renders</p>');
        separadorPuesto = true;
      }
      const siguiente = p.imagenes[i + 1];
      const esVertical = (x) => x && x.img.ratio < 0.95;
      const mismoGrupo = siguiente && siguiente.foto.esRender === actual.foto.esRender;
      if (i > 0 && esVertical(actual) && esVertical(siguiente) && mismoGrupo) {
        filas.push(
          `<div class="galeria__fila">${figura(actual, i, { sizes: media, flex: estilos.flex(actual.img.ratio) })}${figura(siguiente, i + 1, {
            sizes: media,
            flex: estilos.flex(siguiente.img.ratio),
          })}</div>`
        );
        i += 2;
      } else if (esVertical(actual)) {
        filas.push(`<div class="galeria__fila galeria__fila--vertical">${figura(actual, i, { sizes: '(min-width: 1310px) 720px, (min-width: 601px) 62vw, calc(100vw - 32px)' })}</div>`);
        i += 1;
      } else {
        filas.push(`<div class="galeria__fila">${figura(actual, i, { sizes: completa })}</div>`);
        i += 1;
      }
    }
    return filas.join('\n');
  }

  function paginaProyecto(p, anterior, siguiente) {
    const ruta = p.ruta;
    const u = crearU(ruta, modo);
    const soloRenders = p.imagenes.every((x) => x.foto.esRender);
    const datos = [
      ['Ubicación', p.ubicacion],
      ['Año', p.ano],
      ['Superficie', p.superficie],
      ['Rol del estudio', p.rol],
      ['Estado', p.estado],
      ['Desarrollo', p.desarrollo],
      ['Fotografía', p.fotografia],
      ['Imágenes', soloRenders ? 'Renders' : ''],
    ].filter(([, v]) => v);
    const listaDatos = datos.length
      ? `<dl class="ficha__datos">${datos.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
      : '';
    const texto = p.parrafos.length ? `<div class="ficha__texto">${p.parrafos.map((t) => `<p>${esc(t)}</p>`).join('')}</div>` : '';
    const resumen = [p.categoria.nombre.replace(/s$/, '').toLowerCase(), p.ubicacion ? `en ${p.ubicacion}` : '', p.ano ? `(${p.ano})` : '']
      .filter(Boolean)
      .join(' ');
    const recortar = (texto, max = 155) => (texto.length <= max ? texto : `${texto.slice(0, texto.lastIndexOf(' ', max - 1))}…`);
    const descripcion = p.parrafos[0]
      ? recortar(`${p.nombre}: ${p.parrafos[0]}`)
      : `${p.nombre}, ${resumen}. ${p.rol || 'Proyecto'} de ${sitio.nombre}.`;

    const cuerpo = `
<article class="ficha">
  <header class="envoltura ficha__cabecera">
    <p class="etiqueta migas"><a href="${esc(u('/proyectos/'))}">Proyectos</a> <span aria-hidden="true">/</span> <a href="${esc(u(`/proyectos/#${p.categoria.slug}`))}">${esc(p.categoria.nombre)}</a></p>
    <h1 class="ficha__titulo">${esc(p.nombre)}</h1>${listaDatos ? `\n    ${listaDatos}` : ''}${texto ? `\n    ${texto}` : ''}
  </header>
  <div class="envoltura">
    <div class="galeria" data-galeria>
${filasGaleria(p, u)}
    </div>
  </div>
  <nav class="envoltura" aria-label="Otros proyectos">
   <div class="vecinos">
    <a class="vecinos__ant" href="${esc(u(anterior.ruta))}"><span class="etiqueta">Anterior</span><span class="vecinos__nombre">${esc(anterior.nombre)}</span></a>
    <a class="vecinos__todos etiqueta" href="${esc(u('/proyectos/'))}">Todos los proyectos</a>
    <a class="vecinos__sig" href="${esc(u(siguiente.ruta))}"><span class="etiqueta">Siguiente</span><span class="vecinos__nombre">${esc(siguiente.nombre)}</span></a>
   </div>
  </nav>
</article>`;
    return {
      ruta,
      html: documento({
        ruta,
        titulo: `${p.nombre} | ${sitio.nombre}`,
        descripcion,
        cuerpo,
        og: p.og,
        seccion: '/proyectos/',
        tituloLlamado: {
          titulo: '¿Tenés un proyecto parecido?',
          texto: 'Escribinos y lo charlamos. Respondemos por WhatsApp o por email.',
          wsp: wspProyecto(p.nombre),
        },
        jsonld: [migas([{ nombre: 'Proyectos', ruta: '/proyectos/' }, { nombre: p.nombre, ruta }])],
      }),
    };
  }

  function servicios() {
    const ruta = '/servicios/';
    const u = crearU(ruta, modo);
    const entregables = [
      'Documentación ejecutiva completa',
      'Planos de estructura y pases',
      'Planos de cielorrasos, pisos, banquinas y demás',
      'Cómputos detallados en Excel',
      'Planos, detalles y cómputos de todas las instalaciones',
      'Modelos 3D livianos en SketchUp de estructura, arquitectura e instalaciones, para consultar desde cualquier dispositivo',
    ];
    const cuerpo = `
<section class="envoltura encabezado">
  <h1 class="titular">Servicios</h1>
  <p class="declaracion declaracion--media">Diseñamos, modelamos, construimos. Hacemos arquitectura de principio a fin, con diseño y tecnología en todo el proceso.</p>
</section>
<section class="envoltura servicio" id="proyecto" aria-labelledby="t-proyecto">
  <div class="servicio__fila">
  <h2 id="t-proyecto" class="servicio__titulo">Proyecto</h2>
  <div class="servicio__cuerpo">
    <p>Hacemos proyectos arquitectónicos integrales. Empezamos por el anteproyecto, donde traducimos los deseos y las necesidades de cada cliente, y terminamos en un proyecto ejecutivo listo para construir. Diseño, funcionalidad y técnica.</p>
    <p><a class="enlace-flecha" href="${esc(u('/proyectos/'))}">Ver proyectos</a></p>
  </div>
  </div>
</section>
<section class="envoltura servicio" id="direccion" aria-labelledby="t-direccion">
  <div class="servicio__fila">
  <h2 id="t-direccion" class="servicio__titulo">Dirección de obra</h2>
  <div class="servicio__cuerpo">
    <p>Dirigimos la obra para que se construya lo que se proyectó: seguimiento técnico, control de calidad y coordinación de gremios y proveedores. Planificamos con la documentación y los cómputos del proyecto para reducir imprevistos y adicionales.</p>
  </div>
  </div>
</section>
<section class="envoltura servicio" id="bim" aria-labelledby="t-bim">
  <div class="servicio__fila">
  <h2 id="t-bim" class="servicio__titulo">Modelado BIM</h2>
  <div class="servicio__cuerpo">
    <p>Para constructoras, desarrolladoras y estudios de arquitectura e ingeniería, desarrollamos el modelo BIM del edificio: un gemelo digital con precisión y realidad constructiva, que incluye el diseño de las instalaciones y la verificación de interferencias. El resultado es una obra mejor planificada, con menos imprevistos y adicionales.</p>
    <h3 class="etiqueta">Qué entregamos</h3>
    <ul class="lista">${entregables.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
    <p class="servicio__nota">BIM (Building Information Modeling) es un modelo 3D en el que cada elemento tiene medidas, materiales y cantidades. Nos permite detectar problemas antes de la obra, tomar mejores decisiones de diseño y trabajar coordinados con todos los rubros.</p>
    <p class="servicio__acciones"><a class="boton boton--claro" href="${esc(u('/contacto/'))}?tipo=bim">Pedir presupuesto de modelado BIM</a> <a class="enlace-flecha" href="https://www.youtube.com/watch?v=3WhUVH-MJrI" target="_blank" rel="noopener noreferrer">Ver el video del proceso</a></p>
  </div>
  </div>
</section>
<section class="envoltura servicio" id="desarrollos" aria-labelledby="t-desarrollos">
  <div class="servicio__fila">
  <h2 id="t-desarrollos" class="servicio__titulo">Desarrollos</h2>
  <div class="servicio__cuerpo">
    <p>Proyectamos y dirigimos los edificios de Habitar, desarrollos inmobiliarios organizados como fideicomisos al costo: análisis financiero, proyecto, dirección y administración de obra.</p>
    <p><a class="enlace-flecha" href="${esc(u('/proyectos/#edificios'))}">Ver edificios</a> <a class="enlace-flecha" href="https://habitarmonroe.com.ar/" target="_blank" rel="noopener noreferrer">Habitar Monroe, en desarrollo</a></p>
  </div>
  </div>
</section>`;
    return {
      ruta,
      html: documento({
        ruta,
        titulo: `Servicios de arquitectura y BIM | ${sitio.nombre}`,
        descripcion: 'Proyecto de arquitectura, dirección de obra, modelado BIM para constructoras y estudios, y desarrollos inmobiliarios en fideicomiso al costo.',
        cuerpo,
        seccion: '/servicios/',
        jsonld: [migas([{ nombre: 'Servicios', ruta }])],
      }),
    };
  }

  function nosotros() {
    const ruta = '/nosotros/';
    const u = crearU(ruta, modo);
    const foto = ctx.imagenesSitio.estudio;
    const cuerpo = `
<section class="envoltura encabezado">
  <h1 class="titular">Nosotros</h1>
</section>
<section class="envoltura nosotros">
  ${foto ? `<figure class="nosotros__foto ${estilos.color(foto)}">${imagen(foto, { u, sizes: '(min-width: 900px) 520px, calc(100vw - 32px)', alt: 'Juan Manuel Gardes y Juan Manuel Marull', cargar: 'eager' })}</figure>` : ''}
  <div class="nosotros__texto">
    <p class="declaracion declaracion--media">El estudio está dirigido por los arquitectos Juan Manuel Gardes y Juan Manuel Marull.</p>
    <dl class="socios">
      <div><dt>Juan Manuel Gardes</dt><dd>Arquitecto. FADU, Universidad de Buenos Aires, 2012.</dd></div>
      <div><dt>Juan Manuel Marull</dt><dd>Arquitecto. FADU, Universidad de Buenos Aires, 2013.</dd></div>
    </dl>
    <p>Nos conocimos en 2005, cursando la carrera de Arquitectura. En 2015 fundamos el estudio, después de trabajar juntos en <a href="http://www.aftarquitectos.com.ar/" target="_blank" rel="noopener noreferrer">AFT Arquitectos</a> y luego en <a href="http://www.gardesgardes.com.ar" target="_blank" rel="noopener noreferrer">Gardes – Gardes</a>, con quienes seguimos asociados para algunos proyectos.</p>
    <p>Participamos en concursos y proyectos, en la ejecución de obras y en el desarrollo de emprendimientos inmobiliarios.</p>
    <p>Estamos matriculados en la Ciudad de Buenos Aires y en la Provincia de Buenos Aires.</p>
  </div>
</section>`;
    return {
      ruta,
      html: documento({
        ruta,
        titulo: `Nosotros | ${sitio.nombre}`,
        descripcion: 'Estudio de arquitectura dirigido por Juan Manuel Gardes y Juan Manuel Marull, fundado en 2015 en Buenos Aires.',
        cuerpo,
        seccion: '/nosotros/',
        jsonld: [migas([{ nombre: 'Nosotros', ruta }])],
      }),
    };
  }

  function contacto() {
    const ruta = '/contacto/';
    const u = crearU(ruta, modo);
    const endpoint = modo === 'produccion' ? sitio.formulario_url || '' : '';
    const conEndpoint = Boolean(endpoint);
    const tipos = [
      ['vivienda', 'Vivienda nueva'],
      ['reforma', 'Reforma o ampliación'],
      ['edificio', 'Edificio o desarrollo'],
      ['bim', 'Modelado BIM para mi empresa o estudio'],
      ['direccion', 'Dirección de obra'],
      ['otro', 'Otro'],
    ];
    const etapas = ['Tengo el terreno', 'Tengo un proyecto', 'La obra ya empezó', 'Estoy explorando'];
    const redes = Object.entries(sitio.redes || {})
      .map(([nombre, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(nombre)}</a>`)
      .join('<br>');
    const cuerpo = `
<section class="envoltura encabezado">
  <h1 class="titular">Contacto</h1>
  <p class="declaracion declaracion--media">Contanos qué proyecto tenés en mente. Respondemos por WhatsApp o por email.</p>
</section>
<section class="envoltura contacto">
  <div class="contacto__datos">
    <div><p class="etiqueta">WhatsApp</p><p class="contacto__dato"><a href="${esc(wsp)}" target="_blank" rel="noopener noreferrer">${esc(sitio.telefono)}</a></p></div>
    <div><p class="etiqueta">Email</p><p class="contacto__dato"><a href="mailto:${esc(sitio.email)}">${esc(sitio.email)}</a></p></div>
    <div><p class="etiqueta">Oficina</p><p>${esc(sitio.direccion)}<br>${esc(sitio.localidad)}</p><p><a class="enlace-flecha" href="${esc(sitio.mapa)}" target="_blank" rel="noopener noreferrer">Ver en Google Maps</a></p></div>
    <div><p class="etiqueta">Redes</p><p>${redes}</p></div>
  </div>
  <div class="contacto__formulario">
    <form class="formulario" data-formulario method="post" action="${esc(endpoint || u('/contacto/'))}" data-endpoint="${esc(endpoint)}" data-whatsapp="${esc(sitio.whatsapp)}"${modo === 'vista-previa' ? ' data-vista-previa' : ''}>
      <div class="formulario__grilla">
        <div class="campo"><label for="f-nombre">Nombre</label><input id="f-nombre" name="nombre" type="text" required maxlength="80" autocomplete="name"></div>
        <div class="campo"><label for="f-email">Email${conEndpoint ? '' : ' <span>(opcional)</span>'}</label><input id="f-email" name="email" type="email" maxlength="120" autocomplete="email"${conEndpoint ? ' required' : ''}></div>
        <div class="campo"><label for="f-telefono">Teléfono <span>(opcional)</span></label><input id="f-telefono" name="telefono" type="tel" maxlength="40" autocomplete="tel"></div>
        <div class="campo"><label for="f-tipo">Tipo de proyecto</label><select id="f-tipo" name="tipo"><option value="">Elegí una opción</option>${tipos
          .map(([clave, texto]) => `<option value="${esc(texto)}" data-clave="${clave}">${esc(texto)}</option>`)
          .join('')}</select></div>
        <div class="campo"><label for="f-ubicacion">Ubicación <span>(opcional)</span></label><input id="f-ubicacion" name="ubicacion" type="text" maxlength="120" placeholder="Barrio o localidad"></div>
        <div class="campo"><label for="f-etapa">Etapa</label><select id="f-etapa" name="etapa"><option value="">Elegí una opción</option>${etapas
          .map((e) => `<option value="${esc(e)}">${esc(e)}</option>`)
          .join('')}</select></div>
        <div class="campo campo--ancho"><label for="f-mensaje">Mensaje</label><textarea id="f-mensaje" name="mensaje" rows="6" required maxlength="3000"></textarea></div>
        <div class="oculto" aria-hidden="true"><label for="f-web">No completar este campo</label><input id="f-web" name="sitio_web" type="text" tabindex="-1" autocomplete="off"></div>
        <input type="hidden" name="inicio" value="">
      </div>
      <div class="formulario__acciones">
        <button class="boton" type="submit">${conEndpoint ? 'Enviar consulta' : 'Enviar por WhatsApp'}</button>
        <p class="formulario__estado" role="status" aria-live="polite"></p>
      </div>
    </form>
    <div class="formulario__gracias" tabindex="-1" hidden>
      <p class="declaracion declaracion--media">Gracias. Recibimos tu consulta y te respondemos a la brevedad.</p>
    </div>
  </div>
</section>`;
    return {
      ruta,
      html: documento({
        ruta,
        titulo: `Contacto | ${sitio.nombre}`,
        descripcion: `Escribinos por WhatsApp al ${sitio.telefono} o a ${sitio.email}. Oficina en ${sitio.direccion}, ${sitio.localidad}.`,
        cuerpo,
        seccion: '/contacto/',
        llamado: false,
        jsonld: [migas([{ nombre: 'Contacto', ruta }])],
      }),
    };
  }

  /** Gráfico externo (Power BI o Infogram). En la vista previa se muestra como enlace. */
  function incrustado(url, titulo, tipo) {
    if (modo === 'vista-previa') {
      return `<p class="incrustado__aviso">En el sitio publicado acá se ve el gráfico «${esc(titulo)}». <a class="enlace-flecha" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir el gráfico</a></p>`;
    }
    return `<div class="incrustado__marco incrustado__marco--${tipo}"><iframe src="${esc(url)}" title="${esc(titulo)}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  }

  function costos() {
    const ruta = '/costos/';
    const cuerpo = `
<section class="envoltura encabezado">
  <h1 class="titular">Costos de obra</h1>
  <p class="declaracion declaracion--media">Evolución de los costos de obra (no incluye honorarios).</p>
</section>
<section class="envoltura incrustado">
  ${incrustado('https://app.powerbi.com/view?r=eyJrIjoiM2EzMzA5MTMtZWMwNS00NmE2LTlkYTUtNTI1NWE1YWNmYjNmIiwidCI6IjgyNzJkNzA0LThlM2YtNDlhMS04OWQ0LTQ4MzE0MGYzMTMwNCIsImMiOjR9&pageName=8a16b88094e1b1986d48', 'Análisis de costos de construcción', 'powerbi')}
  <h2 class="etiqueta incrustado__titulo">Costo de construcción histórico real</h2>
  ${incrustado('https://e.infogram.com/2cd0e55d-bfb5-46db-bc61-b9649c6d14ce?src=embed', 'Costo de construcción histórico real', 'infogram')}
</section>`;
    return { ruta, html: documento({ ruta, titulo: `Costos de obra | ${sitio.nombre}`, descripcion: 'Evolución de los costos de obra.', cuerpo, noindex: true }) };
  }

  function habmon() {
    const ruta = '/habmon/';
    const cuerpo = `
<section class="envoltura encabezado">
  <h1 class="titular">Habitar Monroe</h1>
  <p class="declaracion declaracion--media">Lista de precios. Más información en <a href="https://habitarmonroe.com.ar/" target="_blank" rel="noopener noreferrer">habitarmonroe.com.ar</a>.</p>
</section>
<section class="envoltura incrustado">
  ${incrustado('https://e.infogram.com/877b76fb-5db8-4363-bda0-1ae1a38a8965?src=embed', 'Habitar Monroe: lista de precios', 'infogram')}
</section>`;
    return { ruta, html: documento({ ruta, titulo: `Habitar Monroe: lista de precios | ${sitio.nombre}`, descripcion: 'Lista de precios de Habitar Monroe.', cuerpo, noindex: true, llamado: false }) };
  }

  function noEncontrada() {
    const ruta = '/404.html';
    const cuerpo = `
<section class="envoltura encabezado">
  <h1 class="titular">Página no encontrada</h1>
  <p class="declaracion declaracion--media">La dirección cambió o ya no existe.</p>
  <p class="servicio__acciones"><a class="boton" href="/">Ir al inicio</a> <a class="enlace-flecha" href="/proyectos/">Ver proyectos</a></p>
</section>`;
    return { ruta, html: documento({ ruta, titulo: `Página no encontrada | ${sitio.nombre}`, descripcion: 'La página que buscás no existe.', cuerpo, noindex: true, llamado: false }) };
  }

  return { inicio, indiceProyectos, paginaProyecto, servicios, nosotros, contacto, costos, habmon, noEncontrada };
}
