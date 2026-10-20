// Archivos de configuración del servidor y para buscadores: .htaccess, robots.txt, sitemap.xml,
// site.webmanifest y .well-known/security.txt
import { esc } from './util.mjs';

const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function politicaSeguridad(sitio) {
  const script = ["'self'"];
  const connect = ["'self'"];
  const img = ["'self'", 'data:'];
  const form = ["'self'"];
  if (sitio.google_analytics) {
    script.push('https://*.googletagmanager.com');
    connect.push('https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com');
    img.push('https://*.google-analytics.com', 'https://*.googletagmanager.com');
  }
  if (sitio.formulario_url) {
    connect.push('https://script.google.com', 'https://script.googleusercontent.com');
    form.push('https://script.google.com');
  }
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self'",
    `img-src ${img.join(' ')}`,
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    'frame-src https://app.powerbi.com https://e.infogram.com',
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${form.join(' ')}`,
    "frame-ancestors 'self'",
    "manifest-src 'self'",
    "worker-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * redirecciones: [{ desde, hacia, tipo }] ya resueltas (para fotos, `hacia` es la URL de la imagen nueva).
 */
export function htaccess({ sitio, redirecciones }) {
  const host = new URL(sitio.url).host;
  const reglasPaginas = [];
  const reglasFotos = [];
  for (const r of redirecciones) {
    let desde = r.desde.replace(/^\//, '');
    if (r.tipo === 'foto') {
      const ext = desde.match(/\.[a-z0-9]+$/i)?.[0] || '';
      let base = desde.slice(0, desde.length - ext.length);
      const escalada = base.endsWith('-scaled');
      if (escalada) base = base.slice(0, -'-scaled'.length);
      const patron = `^${escaparRegex(base)}(?:-scaled)?(?:-\\d+x\\d+)?${escaparRegex(ext)}$`;
      reglasFotos.push(`RewriteRule ${patron} ${r.hacia} [R=301,L]`);
    } else {
      desde = desde.replace(/\/$/, '');
      const patron = desde ? `^${escaparRegex(desde)}/?$` : '^$';
      const destino = r.hacia.includes('#') ? `${r.hacia} [R=301,L,NE]` : `${r.hacia} [R=301,L]`;
      reglasPaginas.push(`RewriteRule ${patron} ${destino}`);
    }
  }

  return `# ---------------------------------------------------------------------------
# gardesmarull.com.ar — configuración del servidor (LiteSpeed / Apache)
# Este archivo lo genera scripts/construir.mjs: no lo edites en el servidor,
# se reemplaza en cada publicación.
# ---------------------------------------------------------------------------

Options -Indexes -MultiViews
DirectoryIndex index.html
AddDefaultCharset utf-8
ErrorDocument 403 /404.html
ErrorDocument 404 /404.html
ErrorDocument 410 /404.html

<IfModule mod_mime.c>
  AddType image/avif .avif
  AddType image/webp .webp
  AddType font/woff2 .woff2
  AddType application/manifest+json .webmanifest
  AddType image/svg+xml .svg
</IfModule>

# Nada ejecutable ni archivos sensibles: este sitio es 100 % estático.
<FilesMatch "\\.(php[0-9]?|PHP[0-9]?|phtml|phar|pl|py|cgi|sh|asp|aspx|jsp|sql|bak|old|orig|swp|log|ini|env|zip|tar|gz|tgz|7z|rar|md|yml|yaml|lock)$">
  Require all denied
</FilesMatch>

<IfModule mod_rewrite.c>
RewriteEngine On

# 1. Siempre HTTPS y sin "www"
RewriteCond %{REQUEST_URI} !^/\\.well-known/acme-challenge/
RewriteCond %{HTTPS} off [OR]
RewriteCond %{HTTP_HOST} !^${escaparRegex(host)}(:[0-9]+)?$ [NC]
RewriteRule ^ https://${host}%{REQUEST_URI} [R=301,L,NE]

# 2. Archivos y carpetas ocultas (.git, .env, etc.), salvo .well-known
RewriteCond %{REQUEST_URI} !^/\\.well-known/
RewriteRule (^|/)\\. - [F,L]

# 3. Rutas del WordPress anterior que ya no existen (las buscan los robots de ataque)
RewriteRule ^(wp-admin|wp-includes|wp-json)(/|$) - [G,L]
RewriteRule ^(wp-login|xmlrpc|wp-cron|wp-config|wp-signup|wp-trackback)\\.php$ - [G,L]
RewriteRule ^(readme\\.html|license\\.txt)$ - [G,L]
RewriteRule ^(feed|comments/feed)(/|$) - [G,L]
RewriteRule ^(category|tag|author)(/|$) / [R=301,L]
RewriteRule ^[0-9]{4}/[0-9]{2}(/|$) / [R=301,L]
RewriteCond %{QUERY_STRING} (^|&)(p|page_id|cat|s|attachment_id)= [NC]
RewriteRule ^$ /? [R=301,L]

# 4. Fotos del sitio anterior → fotos nuevas (conserva el tráfico de Google Imágenes)
${reglasFotos.join('\n')}
RewriteRule ^wp-content/ - [G,L]

# 5. Páginas del sitio anterior → páginas nuevas
${reglasPaginas.join('\n')}
</IfModule>

<IfModule mod_headers.c>
  Header always set Strict-Transport-Security "max-age=31536000"
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set Content-Security-Policy "${politicaSeguridad(sitio)}"
  Header unset X-Powered-By
  Header always unset X-Powered-By

  # Caché: los archivos con huella (hash) en el nombre no cambian nunca.
  <FilesMatch "\\.[0-9a-f]{8}\\.(css|js|avif|webp|jpg|png|svg|woff2)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\\.(html|xml|txt|webmanifest)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  <FilesMatch "^(favicon\\.ico|favicon-32\\.png|apple-touch-icon\\.png|icono-192\\.png|icono-512\\.png)$">
    Header set Cache-Control "public, max-age=604800"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/plain text/xml application/xml application/javascript text/javascript application/json application/manifest+json image/svg+xml
</IfModule>
`;
}

export function robots(sitio) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitio.url}/sitemap.xml\n`;
}

export function sitemap(sitio, rutas) {
  const urls = rutas.map((r) => `  <url><loc>${esc(sitio.url + r)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function manifiesto(sitio) {
  return JSON.stringify(
    {
      name: sitio.nombre,
      short_name: 'Gardes Marull',
      start_url: '/',
      display: 'browser',
      background_color: '#ffffff',
      theme_color: '#ffffff',
      lang: 'es-AR',
      icons: [
        { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icono-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2
  );
}

export function securityTxt(sitio) {
  const vence = new Date();
  vence.setFullYear(vence.getFullYear() + 1);
  return `Contact: mailto:${sitio.email}\nExpires: ${vence.toISOString()}\nPreferred-Languages: es, en\nCanonical: ${sitio.url}/.well-known/security.txt\n`;
}

export function analytics(id) {
  return `window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', '${id}');\n`;
}
