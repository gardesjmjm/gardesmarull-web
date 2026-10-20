// Procesamiento de imágenes con sharp: tamaños responsive en AVIF + WebP, sin metadatos (EXIF/GPS),
// con caché en .cache/imagenes para no volver a procesar fotos que no cambiaron.
import sharp from 'sharp';
import { readFile, copyFile, readdir, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { hashCorto, existe, escribir, slugificar } from './util.mjs';

// Si cambian estos ajustes, cambiá VERSION para regenerar todo.
const VERSION = 'v1';
const AJUSTES = {
  avif: { quality: 50, effort: 4, chromaSubsampling: '4:2:0' },
  webp: { quality: 76, effort: 5, smartSubsample: true },
  // Planos y esquemas (pocos colores): más calidad para que las líneas queden nítidas.
  avifDibujo: { quality: 72, effort: 4, chromaSubsampling: '4:4:4' },
  webpDibujo: { quality: 90, effort: 5, nearLossless: true },
};

export const PERFILES = {
  produccion: { anchos: [480, 960, 1440, 2048], formatos: ['avif', 'webp'], og: true },
  'vista-previa': { anchos: [1280], formatos: ['webp'], og: false },
};

sharp.cache(false);

export class Procesador {
  constructor({ dirCache, dirSalida, perfil }) {
    this.dirCache = dirCache;
    this.dirSalida = dirSalida;
    this.perfil = PERFILES[perfil];
    this.usados = new Set();
    this.generadas = 0;
    this.reutilizadas = 0;
  }

  anchosPara(anchoOrigen) {
    const objetivos = this.perfil.anchos;
    const tope = Math.min(anchoOrigen, objetivos[objetivos.length - 1]);
    const lista = objetivos.filter((a) => a < tope * 0.8);
    lista.push(tope);
    return lista;
  }

  async datosBase(buffer, id) {
    const archivoMeta = path.join(this.dirCache, `${id}.json`);
    this.usados.add(path.basename(archivoMeta));
    let datos = (await existe(archivoMeta)) ? JSON.parse(await readFile(archivoMeta, 'utf8')) : null;
    if (!datos || !datos.dominante) {
      const meta = await sharp(buffer, { failOn: 'none' }).metadata();
      let ancho = meta.width;
      let alto = meta.height;
      if ((meta.orientation || 1) >= 5) [ancho, alto] = [alto, ancho];
      const stats = await sharp(buffer, { failOn: 'none' }).rotate().resize(200, 200, { fit: 'inside' }).stats();
      datos = { ancho, alto, dominante: stats.dominant, entropia: stats.entropy, formato: meta.format };
      await escribir(archivoMeta, JSON.stringify(datos));
    }
    // Color de espera mientras carga la foto: un toque del color dominante sobre el gris claro del sitio.
    const { r, g, b } = datos.dominante;
    const mezcla = (c, base) => Math.round(c * 0.28 + base * 0.72);
    datos.color = '#' + [mezcla(r, 243), mezcla(g, 243), mezcla(b, 241)].map((n) => n.toString(16).padStart(2, '0')).join('');
    return datos;
  }

  /**
   * Procesa una imagen. carpetaUrl: "/proyectos/casa-vh/" → los archivos van a publicar/proyectos/casa-vh/
   * Devuelve { id, ancho, alto, ratio, color, variantes: { avif: [{ancho, url}], webp: [...] }, mayor }
   */
  async procesar(rutaOrigen, carpetaUrl) {
    const buffer = await readFile(rutaOrigen);
    const id = hashCorto(Buffer.concat([buffer, Buffer.from(VERSION)]), 10);
    const base = slugificar(path.parse(rutaOrigen).name) || 'imagen';
    const datos = await this.datosBase(buffer, id);
    // Planos, cortes y esquemas tienen muy poca variedad de tonos (entropía baja): se guardan con más calidad.
    const esDibujo = datos.entropia < 4.5;
    const variantes = {};
    const dirDestino = path.join(this.dirSalida, ...carpetaUrl.split('/').filter(Boolean));
    await mkdir(dirDestino, { recursive: true });

    for (const formato of this.perfil.formatos) {
      variantes[formato] = [];
      for (const ancho of this.anchosPara(datos.ancho)) {
        const nombre = `${base}-${ancho}.${id.slice(0, 8)}.${formato}`;
        const enCache = path.join(this.dirCache, `${id}-${ancho}.${formato}`);
        this.usados.add(path.basename(enCache));
        if (await existe(enCache)) {
          this.reutilizadas++;
        } else {
          const opciones = esDibujo ? AJUSTES[`${formato}Dibujo`] : AJUSTES[formato];
          await sharp(buffer, { failOn: 'none' })
            .rotate()
            .resize({ width: ancho, withoutEnlargement: true })
            .flatten({ background: '#ffffff' })
            .toFormat(formato, opciones)
            .toFile(enCache);
          this.generadas++;
        }
        await copyFile(enCache, path.join(dirDestino, nombre));
        variantes[formato].push({ ancho, url: carpetaUrl + nombre });
      }
    }
    const webp = variantes.webp;
    return {
      id,
      ancho: datos.ancho,
      alto: datos.alto,
      ratio: datos.ancho / datos.alto,
      color: datos.color,
      variantes,
      mayor: webp[webp.length - 1].url,
      origen: rutaOrigen,
    };
  }

  /** Imagen para compartir en redes (WhatsApp, Facebook, LinkedIn): JPG 1200×630. */
  async og(rutaOrigen, carpetaUrl) {
    if (!this.perfil.og) return null;
    const buffer = await readFile(rutaOrigen);
    const id = hashCorto(Buffer.concat([buffer, Buffer.from(VERSION + 'og')]), 10);
    const enCache = path.join(this.dirCache, `${id}-og.jpg`);
    this.usados.add(path.basename(enCache));
    if (!(await existe(enCache))) {
      await sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize(1200, 630, { fit: 'cover', position: sharp.strategy.attention })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 80, mozjpeg: true })
        .toFile(enCache);
    }
    const nombre = `compartir.${id.slice(0, 8)}.jpg`;
    const dirDestino = path.join(this.dirSalida, ...carpetaUrl.split('/').filter(Boolean));
    await mkdir(dirDestino, { recursive: true });
    await copyFile(enCache, path.join(dirDestino, nombre));
    return carpetaUrl + nombre;
  }

  /** Íconos del sitio (favicon, pantalla de inicio del celular) a partir del isotipo. */
  async iconos(rutaIsotipo) {
    const buffer = await readFile(rutaIsotipo);
    const salida = {};
    const fondoBlanco = { r: 255, g: 255, b: 255, alpha: 1 };
    const icono = (lado, margen) =>
      sharp(buffer)
        .resize(lado - margen * 2, lado - margen * 2, { fit: 'contain', background: fondoBlanco })
        .extend({ top: margen, bottom: margen, left: margen, right: margen, background: fondoBlanco })
        .flatten({ background: '#ffffff' })
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();
    salida['favicon-32.png'] = await icono(32, 0);
    salida['apple-touch-icon.png'] = await icono(180, 18);
    salida['icono-192.png'] = await icono(192, 16);
    salida['icono-512.png'] = await icono(512, 44);
    salida['favicon.ico'] = icoDesdePng(salida['favicon-32.png'], 32);
    return salida;
  }

  /** Borra de la caché lo que ya no se usa (fotos eliminadas o reemplazadas). */
  async limpiarCache() {
    let borrados = 0;
    for (const archivo of await readdir(this.dirCache)) {
      if (!this.usados.has(archivo)) {
        await rm(path.join(this.dirCache, archivo), { force: true });
        borrados++;
      }
    }
    return borrados;
  }
}

/** Arma un .ico mínimo (formato moderno: un PNG adentro). */
function icoDesdePng(png, lado) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(1, 4);
  const entrada = Buffer.alloc(16);
  entrada.writeUInt8(lado, 0);
  entrada.writeUInt8(lado, 1);
  entrada.writeUInt8(0, 2);
  entrada.writeUInt8(0, 3);
  entrada.writeUInt16LE(1, 4);
  entrada.writeUInt16LE(32, 6);
  entrada.writeUInt32LE(png.length, 8);
  entrada.writeUInt32LE(6 + 16, 12);
  return Buffer.concat([cabecera, entrada, png]);
}
