/* Gardes Marull arquitectos — comportamiento del sitio. Sin dependencias.
   Todo es opcional: sin JavaScript el sitio se ve y se navega igual. */
(() => {
  'use strict';
  const d = document;
  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Portada: rotación suave de obras ---------- */
  const marco = d.querySelector('[data-portada]');
  const plantilla = marco && marco.querySelector('template[data-portada-mas]');
  if (marco && plantilla && !reducirMovimiento) {
    const pie = d.querySelector('[data-portada-pie]');
    const botonPausa = d.querySelector('[data-portada-pausa]');
    const iniciar = () => {
      marco.appendChild(plantilla.content.cloneNode(true));
      const items = Array.from(marco.querySelectorAll('.portada__item'));
      items.forEach((el, i) => {
        if (i > 0) el.setAttribute('aria-hidden', 'true');
      });
      let actual = 0;
      let pausado = false;
      let visible = true;
      const mostrar = (i) => {
        const anterior = items[actual];
        anterior.classList.remove('es-activa');
        anterior.setAttribute('aria-hidden', 'true');
        anterior.tabIndex = -1;
        actual = i;
        const el = items[actual];
        el.classList.add('es-activa');
        el.removeAttribute('aria-hidden');
        el.tabIndex = 0;
        if (pie) {
          pie.textContent = el.dataset.nombre;
          pie.setAttribute('href', el.getAttribute('href'));
        }
      };
      const avanzar = () => {
        if (pausado || !visible || d.hidden) return;
        const siguiente = (actual + 1) % items.length;
        const img = items[siguiente].querySelector('img');
        if (img && !(img.complete && img.naturalWidth)) return; // espera a que termine de cargar
        mostrar(siguiente);
      };
      window.setInterval(avanzar, 6000);
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((entradas) => {
          visible = entradas[0].isIntersecting;
        }).observe(marco);
      }
      if (botonPausa) {
        botonPausa.hidden = false;
        botonPausa.addEventListener('click', () => {
          pausado = !pausado;
          botonPausa.setAttribute('aria-pressed', String(pausado));
          botonPausa.textContent = pausado ? 'Reanudar' : 'Pausar';
        });
      }
    };
    const demorar = () => window.setTimeout(iniciar, 1500);
    if (d.readyState === 'complete') demorar();
    else window.addEventListener('load', demorar, { once: true });
  }

  /* ---------- Visor de imágenes de cada proyecto ---------- */
  const galeria = d.querySelector('[data-galeria]');
  if (galeria && typeof window.HTMLDialogElement === 'function') {
    const enlaces = Array.from(galeria.querySelectorAll('a[data-visor]'));
    const visor = d.createElement('dialog');
    visor.className = 'visor';
    visor.setAttribute('aria-label', 'Imágenes del proyecto');
    visor.innerHTML =
      '<figure class="visor__figura"><picture><source type="image/avif"><img alt=""></picture></figure>' +
      '<button type="button" class="visor__cerrar">Cerrar</button>' +
      '<button type="button" class="visor__ant" aria-label="Imagen anterior">←</button>' +
      '<button type="button" class="visor__sig" aria-label="Imagen siguiente">→</button>' +
      '<p class="visor__contador etiqueta" aria-live="polite"></p>';
    d.body.appendChild(visor);
    const fuente = visor.querySelector('source');
    const img = visor.querySelector('img');
    const contador = visor.querySelector('.visor__contador');
    const unaSola = enlaces.length < 2;
    visor.querySelector('.visor__ant').hidden = unaSola;
    visor.querySelector('.visor__sig').hidden = unaSola;
    let indice = 0;

    const mostrar = (i) => {
      indice = (i + enlaces.length) % enlaces.length;
      const a = enlaces[indice];
      const original = a.querySelector('img');
      if (a.dataset.avif) {
        fuente.srcset = a.dataset.avif;
        fuente.sizes = '100vw';
      } else {
        fuente.removeAttribute('srcset');
      }
      img.removeAttribute('src');
      img.width = Number(a.dataset.ancho) || 0;
      img.height = Number(a.dataset.alto) || 0;
      img.sizes = '100vw';
      img.srcset = a.dataset.webp;
      img.src = a.href;
      img.alt = original ? original.alt : '';
      contador.textContent = unaSola ? '' : `${indice + 1} / ${enlaces.length}`;
    };

    enlaces.forEach((a, i) => {
      a.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        mostrar(i);
        visor.showModal();
        d.documentElement.classList.add('visor-abierto');
      });
    });
    visor.addEventListener('close', () => {
      d.documentElement.classList.remove('visor-abierto');
      const a = enlaces[indice];
      a.scrollIntoView({ block: 'center', behavior: 'instant' });
      a.focus({ preventScroll: true });
    });
    visor.querySelector('.visor__cerrar').addEventListener('click', () => visor.close());
    visor.querySelector('.visor__ant').addEventListener('click', () => mostrar(indice - 1));
    visor.querySelector('.visor__sig').addEventListener('click', () => mostrar(indice + 1));
    visor.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        mostrar(indice - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        mostrar(indice + 1);
      }
    });

    // Deslizar con el dedo para pasar de imagen; tocar fuera de la imagen para cerrar.
    let x0 = null;
    let y0 = null;
    let deslizo = false;
    visor.addEventListener('pointerdown', (e) => {
      x0 = e.clientX;
      y0 = e.clientY;
      deslizo = false;
    });
    visor.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      x0 = null;
      if (!unaSola && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        deslizo = true;
        mostrar(indice + (dx < 0 ? 1 : -1));
      }
    });
    visor.addEventListener('click', (e) => {
      if (deslizo) {
        deslizo = false;
        return;
      }
      if (e.target === visor || e.target.classList.contains('visor__figura')) visor.close();
    });
  }

  /* ---------- Filtros del índice de proyectos ---------- */
  const filtros = d.querySelector('[data-filtros]');
  const indiceProyectos = d.querySelector('[data-indice]');
  if (filtros && indiceProyectos) {
    filtros.hidden = false;
    const botones = Array.from(filtros.querySelectorAll('button[data-filtro]'));
    const tarjetas = Array.from(indiceProyectos.children);
    const aplicar = (slug, actualizarDireccion) => {
      if (!botones.some((b) => b.dataset.filtro === slug)) slug = 'todos';
      botones.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filtro === slug)));
      tarjetas.forEach((t) => {
        t.hidden = slug !== 'todos' && t.dataset.categoria !== slug;
      });
      if (actualizarDireccion) {
        try {
          window.history.replaceState(null, '', slug === 'todos' ? window.location.pathname : `#${slug}`);
        } catch (_) {
          /* algunos visores no permiten cambiar la dirección */
        }
      }
    };
    botones.forEach((b) => b.addEventListener('click', () => aplicar(b.dataset.filtro, true)));
    const desdeDireccion = () => aplicar(decodeURIComponent(window.location.hash.slice(1)) || 'todos', false);
    desdeDireccion();
    window.addEventListener('hashchange', desdeDireccion);
  }

  /* ---------- Formulario de contacto ---------- */
  const form = d.querySelector('[data-formulario]');
  if (form) {
    const endpoint = form.dataset.endpoint || '';
    const whatsapp = form.dataset.whatsapp;
    const estado = form.querySelector('.formulario__estado');
    const boton = form.querySelector('button[type="submit"]');
    const gracias = d.querySelector('.formulario__gracias');
    form.elements.inicio.value = String(Date.now());

    try {
      const tipo = new URLSearchParams(window.location.search).get('tipo');
      if (tipo && /^[a-z]+$/.test(tipo)) {
        const opcion = form.querySelector(`option[data-clave="${tipo}"]`);
        if (opcion) opcion.selected = true;
      }
    } catch (_) {
      /* sin parámetros */
    }

    const mostrarError = (texto) => {
      estado.textContent = `${texto} `;
      const enlace = d.createElement('a');
      enlace.href = `https://wa.me/${whatsapp}`;
      enlace.target = '_blank';
      enlace.rel = 'noopener noreferrer';
      enlace.textContent = 'escribinos por WhatsApp';
      estado.append(enlace, '.');
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const datos = Object.fromEntries(new FormData(form).entries());

      if ('vistaPrevia' in form.dataset) {
        estado.textContent = 'Vista previa: en el sitio publicado, este botón envía la consulta.';
        return;
      }

      if (!endpoint) {
        const lineas = [`Hola, soy ${datos.nombre}.`];
        if (datos.tipo) lineas.push(`Consulta: ${datos.tipo}.`);
        if (datos.ubicacion) lineas.push(`Ubicación: ${datos.ubicacion}.`);
        if (datos.etapa) lineas.push(`Etapa: ${datos.etapa}.`);
        lineas.push(datos.mensaje);
        if (datos.email) lineas.push(`Email: ${datos.email}`);
        if (datos.telefono) lineas.push(`Teléfono: ${datos.telefono}`);
        window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(lineas.join('\n'))}`, '_blank', 'noopener');
        estado.textContent = 'Abrimos WhatsApp con tu mensaje listo para enviar.';
        return;
      }

      boton.disabled = true;
      estado.textContent = 'Enviando…';
      try {
        const respuesta = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(datos),
        });
        const resultado = await respuesta.json();
        if (!resultado.ok) throw new Error(resultado.error || 'error');
        form.hidden = true;
        if (gracias) {
          gracias.hidden = false;
          gracias.focus();
        }
      } catch (_) {
        boton.disabled = false;
        mostrarError('No pudimos enviar la consulta. Probá de nuevo en unos minutos o');
      }
    });
  }
})();
