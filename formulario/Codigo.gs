/**
 * Formulario de contacto de gardesmarull.com.ar
 * Recibe las consultas del sitio, las guarda en esta hoja de cálculo y avisa por email.
 *
 * Instalación (una sola vez): ver formulario/LEEME.md
 */

const CONFIG = {
  EMAIL_DESTINO: 'info@gardesmarull.com.ar',
  NOMBRE_HOJA: 'Consultas',
  MAX_POR_HORA: 20, // tope de consultas por hora (protege contra envíos masivos)
  MAX_POR_EMAIL_POR_DIA: 3,
  SEGUNDOS_MINIMOS: 3, // un humano tarda más que esto en completar el formulario
};

const CAMPOS = [
  ['nombre', 80, false],
  ['email', 120, false],
  ['telefono', 40, false],
  ['tipo', 80, false],
  ['ubicacion', 120, false],
  ['etapa', 60, false],
  ['mensaje', 3000, true],
];

function doPost(e) {
  try {
    const datos = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Trampas para robots: campo oculto completado o envío instantáneo → se descarta en silencio.
    if (datos.sitio_web) return responder({ ok: true });
    const inicio = Number(datos.inicio || 0);
    if (!inicio || Date.now() - inicio < CONFIG.SEGUNDOS_MINIMOS * 1000) return responder({ ok: true });

    const limpio = {};
    CAMPOS.forEach(([campo, largo, multilinea]) => (limpio[campo] = limpiar(datos[campo], largo, multilinea)));
    const emailValido = esEmail(limpio.email);
    if (!limpio.nombre || !limpio.mensaje || (!emailValido && !limpio.telefono)) {
      return responder({ ok: false, error: 'datos' });
    }

    // Límites de envío
    const cache = CacheService.getScriptCache();
    const claveHora = 'hora-' + Utilities.formatDate(new Date(), 'GMT', 'yyyyMMddHH');
    const enLaHora = Number(cache.get(claveHora) || 0);
    if (enLaHora >= CONFIG.MAX_POR_HORA) return responder({ ok: false, error: 'limite' });
    if (emailValido) {
      const claveEmail = 'email-' + Utilities.base64EncodeWebSafe(limpio.email.toLowerCase());
      const delEmail = Number(cache.get(claveEmail) || 0);
      if (delEmail >= CONFIG.MAX_POR_EMAIL_POR_DIA) return responder({ ok: false, error: 'limite' });
      cache.put(claveEmail, String(delEmail + 1), 86400);
    }
    cache.put(claveHora, String(enLaHora + 1), 3600);

    // Guardar en la hoja
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      obtenerHoja().appendRow([new Date()].concat(CAMPOS.map(([campo]) => sinFormula(limpio[campo]))));
    } finally {
      lock.releaseLock();
    }

    // Avisar por email (texto plano)
    const cuerpo = [
      'Nueva consulta desde gardesmarull.com.ar',
      '',
      'Nombre: ' + limpio.nombre,
      'Email: ' + (limpio.email || '-'),
      'Teléfono: ' + (limpio.telefono || '-'),
      'Tipo de proyecto: ' + (limpio.tipo || '-'),
      'Ubicación: ' + (limpio.ubicacion || '-'),
      'Etapa: ' + (limpio.etapa || '-'),
      '',
      limpio.mensaje,
    ].join('\n');
    const opciones = { name: 'Sitio gardesmarull.com.ar' };
    if (emailValido) opciones.replyTo = limpio.email;
    MailApp.sendEmail(CONFIG.EMAIL_DESTINO, 'Consulta web: ' + limpio.nombre + (limpio.tipo ? ' · ' + limpio.tipo : ''), cuerpo, opciones);

    return responder({ ok: true });
  } catch (error) {
    console.error(error);
    return responder({ ok: false, error: 'servidor' });
  }
}

function doGet() {
  return ContentService.createTextOutput('Formulario de gardesmarull.com.ar activo.');
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

/** Quita caracteres de control y recorta el largo. */
function limpiar(valor, largo, multilinea) {
  let texto = String(valor == null ? '' : valor);
  texto = multilinea ? texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') : texto.replace(/[\u0000-\u001F\u007F]/g, ' ');
  return texto.trim().slice(0, largo);
}

/** Evita que un texto que empieza con = + - @ se interprete como fórmula en la hoja. */
function sinFormula(texto) {
  return /^[=+\-@\t\r]/.test(texto) ? "'" + texto : texto;
}

function esEmail(texto) {
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(texto);
}

function obtenerHoja() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(CONFIG.NOMBRE_HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(CONFIG.NOMBRE_HOJA);
    hoja.appendRow(['Fecha', 'Nombre', 'Email', 'Teléfono', 'Tipo de proyecto', 'Ubicación', 'Etapa', 'Mensaje']);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

/** Ejecutalo una vez desde el editor para dar los permisos (hoja + email). Te llega un email de prueba. */
function probar() {
  const respuesta = doPost({
    postData: {
      contents: JSON.stringify({
        nombre: 'Prueba del formulario',
        email: CONFIG.EMAIL_DESTINO,
        tipo: 'Otro',
        mensaje: 'Si te llegó este email, el formulario funciona.',
        inicio: Date.now() - 10000,
      }),
    },
  });
  console.log(respuesta.getContent());
}
