# CRM - Música de los Ríos | Cañaveral

Aplicación web local para gestionar leads de personas interesadas en aprender música en Música de los Ríos, Cañaveral.

La aplicación permite:

- Crear leads con nombre, estado, instrumento, nivel, persona responsable, teléfono, email, edad y notas de conversación.
- Consultar los leads guardados en una tabla.
- Buscar por nombre o email y filtrar por instrumento y estado.
- Editar y eliminar leads.
- Consultar indicadores básicos por estado.
- Exportar los leads a un archivo CSV compatible con Excel.
- Mantener los datos entre reinicios mediante una base de datos SQLite local.
- Iniciar sesión antes de acceder a los datos y a la sincronización con Gmail.

El backend y la interfaz se ejecutan desde el mismo proceso Node.js: Express sirve los archivos del frontend y expone la API que utiliza la aplicación.

## Tecnologías utilizadas

- **Node.js**: runtime del servidor. El proyecto requiere Node.js 22 o superior por la versión de `better-sqlite3` utilizada.
- **Express 5**: servidor HTTP, middleware JSON y archivos estáticos.
- **SQLite**: base de datos embebida para la persistencia local.
- **better-sqlite3**: conexión y consultas preparadas contra SQLite.
- **HTML5**: estructura de la interfaz y validación nativa del formulario.
- **CSS3**: estilos, etiquetas visuales y diseño responsive.
- **JavaScript vanilla**: comportamiento del frontend y comunicación con la API mediante Fetch.
- **Google Fonts**: tipografías DM Sans y Manrope, cargadas desde `public/styles.css`.

No se utiliza un framework de frontend ni un ORM.

## Requisitos previos

- Node.js 22 o superior.
- npm, incluido normalmente con Node.js.

Puedes comprobar las versiones instaladas con:

```bash
node --version
npm --version
```

## Instalación

1. Clona o copia el proyecto y entra en su carpeta:

   ```bash
   cd "/Users/armando/Documents/CRM Codex"
   ```

   Si el proyecto está en otra ubicación, sustituye la ruta por la correspondiente.

2. Instala las dependencias definidas en `package-lock.json`:

   ```bash
   npm install
   ```

3. Crea la configuración local a partir del ejemplo:

   ```bash
   cp .env.example .env
   ```

4. Edita únicamente el archivo `.env` local para establecer las contraseñas iniciales. No copies contraseñas, tokens ni secretos a `.env.example` ni a Git.

Sin `CRM_DATABASE_PATH`, la carpeta `data/` y la base de datos `data/crm.sqlite` se crean automáticamente al iniciar el servidor si todavía no existen.

## Configuración

El servidor lee las variables de entorno del sistema y, si existe, el archivo local `.env`. Las variables ya definidas en el sistema tienen prioridad. Consulta [`.env.example`](.env.example) para conocer todos los nombres disponibles.

| Variable | Uso | Valor local de ejemplo |
|---|---|---|
| `NODE_ENV` | Activa ajustes de producción, como la cookie `Secure`. | `development` |
| `PORT` | Puerto HTTP del servidor. | `3001` |
| `HOST` | Interfaz de escucha. En producción, si no se define, se usa `127.0.0.1`; el acceso público futuro será mediante un proxy HTTPS. | No definir en local |
| `CRM_DATABASE_PATH` | Ruta de SQLite. Puede ser absoluta o relativa a la raíz del proyecto. | `data/crm.sqlite` |
| `CRM_ARMANDO_PASSWORD` | Contraseña inicial de Armando, solo cuando todavía no existen usuarios. | Definir en `.env` |
| `CRM_HUMBERTO_PASSWORD` | Contraseña inicial de Humberto, solo cuando todavía no existen usuarios. | Definir en `.env` |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` | Integración opcional con Gmail. | Ver `.env.example` |
| `OPENAI_API_KEY`, `OPENAI_AVAILABILITY_MODEL` | Interpretación opcional de disponibilidad. Ambas variables son necesarias para activarla. | Ver `.env.example` |

No incluyas valores reales de estas variables en el repositorio. Los usuarios iniciales se crean una única vez en la base de datos; cambiar las contraseñas de arranque después no modifica usuarios ya creados.

## Disponibilidad de los leads

Cada lead puede conservar el texto original de disponibilidad comunicado durante la conversación. La interfaz permite solicitar una propuesta visual de franjas, restricciones y notas antes de guardar el lead. La propuesta no se guarda automáticamente: revisa el resultado y pulsa **Guardar lead** para confirmarlo.

La interpretación con IA es opcional. Si no están definidas `OPENAI_API_KEY` y `OPENAI_AVAILABILITY_MODEL`, el CRM no hace ninguna llamada externa y continúa guardando el texto original. El modelo de ejemplo `gpt-6-luna` está elegido para esta extracción breve y de bajo coste. Cuando está activada, solo se envía el texto introducido en el campo Disponibilidad; no se envían el nombre, email, teléfono ni el resto de datos del lead. El texto original siempre se conserva y el resumen se puede eliminar sin borrar ese texto.

## Sincronización con Gmail

El botón **Sincronizar Gmail** busca mensajes enviados al buzón corporativo cuyo asunto contenga `Cañaveral`. Importa los datos del formulario, usa el email de `Responder a` como contacto y actualiza el lead existente cuando ese email ya está registrado. El texto del evento se añade a `conversacion` para conservar el historial.

La integración usa OAuth de Google con permisos de solo lectura. Para activarla hay que crear unas credenciales OAuth para una aplicación web en Google Cloud y definir, antes de iniciar el servidor:

```bash
export GMAIL_CLIENT_ID="..."
export GMAIL_CLIENT_SECRET="..."
export PORT=3001
export GMAIL_REDIRECT_URI="http://localhost:3001/gmail/oauth/callback"
npm start
```

La URI `http://localhost:3001/gmail/oauth/callback` debe estar registrada como URI de redirección autorizada cuando el CRM se ejecute en el puerto 3001. El token se guarda únicamente en `data/gmail-token.json`, excluido de Git. La primera sincronización importa los mensajes de la semana actual; las siguientes reutilizan la última sincronización y solapan dos días para evitar pérdidas en los límites de tiempo.

Para no repetir la configuración cada vez que se abre una Terminal, usa el archivo local `.env` creado desde `.env.example`. Ese archivo está excluido de Git.

## Ejecución local

Inicia el servidor con:

```bash
npm start
```

Por defecto, la aplicación queda disponible en:

```text
http://localhost:3000/
```

Para usar otro puerto, define la variable `PORT` antes de arrancar el servidor:

```bash
PORT=3001 npm start
```

Para detenerlo, pulsa `Ctrl + C` en la terminal.

La comprobación local de disponibilidad está en:

```text
http://localhost:3001/health
```

Devuelve únicamente `{"status":"ok"}` cuando el servidor y SQLite están disponibles.

## Producción: Cañaveral

El CRM de la sede Cañaveral está desplegado para uso interno en `https://crm.musicadelosrios.com`. El sitio principal `musicadelosrios.com` continúa separado en WordPress; este despliegue no modifica su contenido ni su configuración.

La arquitectura de producción es:

```text
Navegador → HTTPS (Caddy) → Express en 127.0.0.1:3000 → SQLite
```

- Caddy gestiona HTTPS y redirige HTTP a HTTPS.
- El servicio `crm-musicadelosrios` ejecuta Express mediante `systemd`.
- Express no está expuesto directamente a Internet: escucha solo en `127.0.0.1:3000`.
- La base de datos de producción se mantiene fuera del código mediante `CRM_DATABASE_PATH=/var/lib/crm-musicadelosrios/crm.sqlite`.
- Las variables reales se guardan únicamente en `/etc/crm-musicadelosrios/.env`, fuera de Git.

La comprobación interna de disponibilidad es:

```text
http://127.0.0.1:3000/health
```

Debe devolver únicamente `{"status":"ok"}`. El CRM requiere una sesión autenticada para consultar datos o sincronizar Gmail.

El CRM es de uso interno. La aplicación devuelve `X-Robots-Tag: noindex, nofollow, noarchive` y la página incluye una directiva equivalente. Esto reduce la indexación accidental, pero no sustituye la autenticación.

### Gmail en producción

La integración usa OAuth de Google con permiso de solo lectura. La URI autorizada de producción debe ser exactamente:

```text
https://crm.musicadelosrios.com/gmail/oauth/callback
```

La URI local `http://localhost:3001/gmail/oauth/callback` debe mantenerse si se va a seguir utilizando Gmail desde el entorno local. El token de OAuth se guarda fuera de Git en `data/gmail-token.json` con permisos restringidos; no debe copiarse al repositorio ni mostrarse en terminales o conversaciones.

### Copias de seguridad y recuperación

La copia automática obtiene una instantánea consistente de SQLite mediante `.backup`, la conserva localmente en el Mac y valida su integridad con `PRAGMA quick_check` usando el modo `immutable=1`.

- El CRM continúa funcionando aunque el Mac esté apagado.
- La copia local programada se ejecuta cuando el Mac está encendido y la sesión de Armando está iniciada.
- La retención actual conserva las copias locales durante 30 días y las copias temporales del servidor durante 2 días.
- Una copia de base de datos no incluye el token de Gmail; tras reconstruir un servidor desde una copia habría que autorizar Gmail de nuevo.

Antes de restaurar una copia, valida primero una copia de prueba y confirma que los conteos esperados aparecen. No copies directamente una base SQLite activa ni sobrescribas la base de producción sin una copia previa y autorización expresa.

## API disponible

La interfaz utiliza estos endpoints:

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/login` | Inicia una sesión y establece una cookie HttpOnly. |
| `GET` | `/auth/me` | Devuelve el usuario de la sesión actual. |
| `POST` | `/logout` | Cierra la sesión actual. |
| `GET` | `/health` | Comprueba servidor y SQLite sin devolver información sensible. |
| `GET` | `/options` | Devuelve las opciones válidas de estados, instrumentos y niveles. |
| `POST` | `/availability/interpret` | Propone un resumen visual de disponibilidad, sin guardarlo. Requiere la IA configurada. |
| `GET` | `/leads` | Devuelve todos los leads, ordenados del más reciente al más antiguo. |
| `POST` | `/leads` | Valida y crea un lead. |
| `PUT` | `/leads/:id` | Actualiza un lead existente. |
| `DELETE` | `/leads/:id` | Elimina un lead existente. |
| `GET` | `/leads/export.csv` | Descarga los leads en formato CSV. |

Los datos se envían y reciben en JSON con nombres en `camelCase`, por ejemplo `asignadoA` y `creadoEn`. SQLite utiliza nombres internos en `snake_case`, que el backend convierte antes de responder.

## Estructura del proyecto

```text
CRM Codex/
├── data/
│   ├── crm.sqlite       # Base de datos local con los leads
│   ├── crm.sqlite-shm   # Archivo auxiliar generado por SQLite en modo WAL
│   └── crm.sqlite-wal   # Registro de escritura de SQLite en modo WAL
├── docs/
│   └── INFORME_TECNICO.md # Informe técnico ampliado
├── public/
│   ├── index.html        # Interfaz, formulario, filtros y tabla
│   ├── app.js            # Lógica del frontend y llamadas a la API
│   └── styles.css        # Estilos y diseño responsive
├── src/
│   └── server.js         # Servidor Express, API y acceso a SQLite
├── .gitignore            # Archivos excluidos del control de versiones
├── package.json          # Metadatos, script de inicio y dependencias
├── package-lock.json     # Versiones bloqueadas de las dependencias
└── README.md             # Documentación del proyecto
```

Los archivos `crm.sqlite-shm` y `crm.sqlite-wal` son auxiliares del modo WAL de SQLite y pueden aparecer mientras el servidor o alguna conexión a la base de datos está activa. La carpeta `data/` contiene información persistente de la aplicación; incluye esos archivos en las copias de seguridad cuando sea necesario conservar los leads.

## Notas de desarrollo

- La API valida los campos obligatorios, las opciones permitidas y que `edad` sea un entero igual o mayor que cero.
- La fecha de alta se guarda en formato ISO y se conserva al editar un lead.
- La aplicación está orientada a uso local o de baja concurrencia. La API de datos y Gmail requiere una sesión autenticada.
- Para un despliegue futuro siguen siendo necesarios HTTPS, proxy inverso, copias de seguridad verificadas, actualización del sistema y supervisión. Esta fase no configura ninguno de esos recursos.
