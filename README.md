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

No incluyas valores reales de estas variables en el repositorio. Los usuarios iniciales se crean una única vez en la base de datos; cambiar las contraseñas de arranque después no modifica usuarios ya creados.

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

## Preparación para producción futura

Esta sección prepara el proyecto para un futuro servidor, pero no crea ni configura ningún recurso externo.

1. Instala Node.js 22 y npm en el servidor futuro. Desde la carpeta del proyecto, instala exactamente las dependencias bloqueadas:

   ```bash
   npm ci
   ```

2. Crea un `.env` fuera del control de versiones y usa valores reales solo en ese servidor. Como mínimo, configura:

   ```text
   NODE_ENV=production
   PORT=3000
   CRM_DATABASE_PATH=/var/lib/crm-musicadelosrios/crm.sqlite
   ```

   Añade también las contraseñas iniciales únicamente si se va a crear una base de datos nueva y vacía. No guardes secretos en el código ni en Git.

3. Conserva la base SQLite fuera de la carpeta de código mediante `CRM_DATABASE_PATH`. Antes de un despliegue real, realiza y verifica una copia de seguridad de la base junto con sus archivos WAL y SHM cuando existan.

4. Arranca el proceso con:

   ```bash
   npm start
   ```

5. Comprueba localmente en el servidor `http://127.0.0.1:3000/health`. La publicación mediante HTTPS, proxy inverso, DNS y dominio se configurarán en una fase posterior.

SQLite se mantiene por ahora para la única sede Cañaveral. Esta preparación no añade sedes, no migra datos reales y no publica el CRM en Internet.

El CRM es de uso interno. La aplicación devuelve `X-Robots-Tag: noindex, nofollow, noarchive` y la página incluye una directiva equivalente. Esto reduce la indexación accidental, pero no sustituye la autenticación ni la futura configuración de HTTPS y del proxy inverso.

## API disponible

La interfaz utiliza estos endpoints:

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/login` | Inicia una sesión y establece una cookie HttpOnly. |
| `GET` | `/auth/me` | Devuelve el usuario de la sesión actual. |
| `POST` | `/logout` | Cierra la sesión actual. |
| `GET` | `/health` | Comprueba servidor y SQLite sin devolver información sensible. |
| `GET` | `/options` | Devuelve las opciones válidas de estados, instrumentos y niveles. |
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
