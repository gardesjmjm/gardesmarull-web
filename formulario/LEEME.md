# Formulario de contacto (opcional)

Sin configurar nada, el formulario del sitio abre WhatsApp con el mensaje ya escrito.
Si querés que además las consultas lleguen por email y queden guardadas en una hoja de Google, seguí estos pasos (10 minutos, una sola vez).

1. En Google Drive creá una hoja de cálculo nueva: **Consultas web Gardes Marull**.
2. En la hoja: **Extensiones → Apps Script**. Borrá lo que aparece y pegá todo el contenido de `Codigo.gs`.
3. Revisá `EMAIL_DESTINO` (arriba de todo) y guardá (ícono de disquete).
4. Elegí la función **probar** en la barra de arriba y tocá **Ejecutar**. Google te pide permisos: aceptalos con tu cuenta. Te tiene que llegar un email de prueba y aparecer una fila en la pestaña *Consultas*.
5. **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
6. Copiá la URL que termina en `/exec`.
7. Pegala en `contenido/sitio.json`, en `"formulario_url"`, y publicá:

```powershell
git add -A; if ($?) { git commit -m "Activar formulario" }; if ($?) { git push }
```

El botón del formulario pasa a decir «Enviar consulta» y el sitio permite esa conexión en su política de seguridad automáticamente.

## Seguridad

- El script valida y recorta cada campo, descarta envíos de robots (campo oculto y envíos instantáneos) y limita a 20 consultas por hora y 3 por día por email.
- Los textos se guardan de forma que la hoja nunca los interprete como fórmulas.
- Si alguna vez cambiás el código, hacé **Implementar → Gestionar implementaciones → editar → Nueva versión** para que la URL siga siendo la misma.
