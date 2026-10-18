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

La carpeta `data/` y la base de datos `data/crm.sqlite` se crean automáticamente al iniciar el servidor si todavía no existen.

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

Para no repetir la configuración cada vez que se abre una Terminal, guarda esas variables en un archivo local `.env` en la raíz del proyecto. Ese archivo está excluido de Git:

```text
PORT=3001
GMAIL_CLIENT_ID=tu-id-de-cliente-completo
GMAIL_CLIENT_SECRET=tu-secreto-de-cliente
GMAIL_REDIRECT_URI=http://localhost:3001/gmail/oauth/callback
```

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

## API disponible

La interfaz utiliza estos endpoints:

| Método | Ruta | Descripción |
|---|---|---|
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
- La aplicación está orientada a uso local o de baja concurrencia. Si se expone fuera del equipo, conviene añadir autenticación, autorización, copias de seguridad y medidas de seguridad para la API.
