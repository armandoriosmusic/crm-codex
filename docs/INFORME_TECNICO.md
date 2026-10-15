# Informe técnico de la aplicación CRM de leads

## 1. Descripción general

La aplicación es un CRM sencillo para gestionar personas interesadas en aprender música en **Música de los Ríos | Cañaveral**.

Permite:

- Crear un lead con nombre, email, teléfono, edad, instrumento, nivel, estado, responsable y notas de conversación.
- Consultar todos los leads guardados.
- Buscar y filtrar la lista por nombre/email, instrumento y estado.
- Editar un lead existente.
- Eliminar un lead después de una confirmación en pantalla.
- Mantener los datos entre reinicios mediante una base de datos SQLite local.

La solución está organizada como una aplicación web monolítica pequeña: el mismo proceso Node.js sirve la interfaz web y expone la API HTTP que utiliza el frontend.

## 2. Estructura de carpetas y archivos

```text
CRM Codex/
├── data/
│   ├── crm.sqlite       # Base de datos SQLite principal
│   ├── crm.sqlite-shm   # Archivo auxiliar de SQLite en modo WAL
│   └── crm.sqlite-wal   # Registro de escritura de SQLite en modo WAL
├── public/
│   ├── index.html       # Estructura y contenido de la interfaz
│   ├── app.js           # Lógica del frontend y llamadas a la API
│   └── styles.css       # Diseño visual y responsive
├── src/
│   └── server.js        # Servidor Express, API y acceso a SQLite
├── package.json         # Metadatos, scripts y dependencias directas
├── package-lock.json    # Versiones concretas de dependencias instaladas
└── docs/
    └── INFORME_TECNICO.md
```

`node_modules/`, `.pnpm-store/` y `.DS_Store` son elementos locales del entorno y no forman parte de la lógica de negocio. La carpeta `data/` contiene datos persistentes de la aplicación; debe incluirse en las copias de seguridad si los leads son importantes.

## 3. Responsabilidad de cada archivo principal

### `package.json`

Define el proyecto `crm-leads-api`, su punto de entrada (`src/server.js`), el comando `npm start` y las dependencias principales:

- `express`: servidor HTTP, middleware JSON y archivos estáticos.
- `better-sqlite3`: conexión síncrona y consultas preparadas contra SQLite.

### `src/server.js`

Es el backend completo de la aplicación. Sus responsabilidades son:

1. Crear la carpeta `data/` y abrir `data/crm.sqlite`.
2. Activar el modo `WAL` de SQLite.
3. Crear la tabla `leads` si todavía no existe.
4. Servir los archivos de `public/`.
5. Exponer las opciones válidas de estados, instrumentos y niveles mediante `GET /options`.
6. Exponer las operaciones CRUD de leads:

   | Método | Ruta | Función |
   |---|---|---|
   | `GET` | `/leads` | Devuelve los leads ordenados del más reciente al más antiguo. |
   | `POST` | `/leads` | Valida y crea un lead. Devuelve `201` y la fila creada. |
   | `PUT` | `/leads/:id` | Valida y actualiza un lead existente. |
   | `DELETE` | `/leads/:id` | Elimina un lead y devuelve el registro eliminado. |

   También normaliza los nombres internos `snake_case` de SQLite al formato `camelCase` que utiliza el frontend.

### `public/index.html`

Define la pantalla de usuario: cabecera, formulario de alta/edición, filtros, tabla de resultados, mensajes de estado y estado vacío. El formulario incluye validación HTML para nombre y email.

### `public/app.js`

Contiene toda la lógica de interacción del navegador:

- Carga las opciones desde `/options`.
- Carga los leads desde `/leads` al iniciar y al pulsar “Actualizar”.
- Convierte el formulario en una petición `POST` o `PUT` según el modo actual.
- Renderiza la tabla de forma programática.
- Gestiona edición, cancelación y borrado.
- Aplica los filtros localmente sobre el array `allLeads`.
- Muestra mensajes de éxito y error.

### `public/styles.css`

Contiene el diseño visual completo: colores, tipografía, tarjetas, formulario, tabla, etiquetas de estado, botones, estados vacíos y adaptación a pantallas pequeñas. Importa las fuentes `DM Sans` y `Manrope` desde Google Fonts.

### `data/crm.sqlite`

Es la persistencia principal. La tabla `leads` contiene:

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INTEGER | Identificador autoincremental. |
| `nombre` | TEXT | Nombre obligatorio. |
| `estado` | TEXT | Estado del proceso comercial. |
| `instrumento` | TEXT | Instrumento o actividad de interés. |
| `nivel` | TEXT | Nivel musical. |
| `asignado_a` | TEXT | Persona responsable. |
| `telefono` | TEXT | Teléfono de contacto. |
| `email` | TEXT | Email de contacto. |
| `edad` | INTEGER | Edad opcional, no negativa. |
| `conversacion` | TEXT | Notas de seguimiento. |
| `creado_en` | TEXT | Fecha de alta en formato ISO. |

## 4. Flujo completo al crear un lead

```text
Usuario
  ↓
Formulario de public/index.html
  ↓ submit
public/app.js
  ↓ fetch POST /leads + JSON
Express en src/server.js
  ↓ parseo y validación
Normalización de datos
  ↓ prepared statement INSERT
SQLite: data/crm.sqlite
  ↓ SELECT de la fila recién creada
Respuesta JSON 201
  ↓
public/app.js recarga GET /leads y renderiza la tabla
```

### Paso a paso

1. Al cargar la página, `app.js` ejecuta `loadOptions()` y `loadLeads()`. Las opciones de los desplegables no están duplicadas en el HTML: se reciben de `GET /options`.
2. El usuario completa el formulario. El navegador exige nombre y email mediante los atributos HTML `required`; el backend vuelve a validar los datos, por lo que no depende de que exista un navegador.
3. Al enviar, `app.js` cancela el envío HTML normal y construye un objeto JSON. Para un alta, envía `POST /leads` con `Content-Type: application/json`.
4. Express procesa el JSON con `express.json()` y `server.js` comprueba que el cuerpo sea un objeto, que `nombre` no esté vacío, que los valores enumerados pertenezcan a las opciones permitidas, que los campos de texto sean cadenas y que `edad` sea un entero mayor o igual que cero.
5. El backend normaliza el registro: elimina espacios innecesarios en varios campos, asigna `No contesta` si no se indica estado, convierte campos vacíos opcionales en `null` o cadenas vacías según el modelo y genera `creadoEn` con `new Date().toISOString()`.
6. `better-sqlite3` ejecuta una sentencia preparada `INSERT`. SQLite genera `id` automáticamente.
7. El backend consulta la fila recién insertada, la serializa a camelCase y responde con HTTP `201`.
8. El frontend comprueba la respuesta, limpia el formulario, muestra el mensaje de éxito y vuelve a solicitar la lista completa. La tabla se vuelve a renderizar y el nuevo lead aparece ordenado por `id` descendente.

Si ocurre un error de validación o de conexión, el backend devuelve un código HTTP de error y un objeto `{ error: "..." }`; `app.js` muestra ese mensaje al usuario.

## 5. Tecnologías utilizadas

- **JavaScript en navegador**, sin framework frontend.
- **HTML5**, incluyendo formularios, elementos semánticos y validación nativa.
- **CSS3**, con diseño responsive mediante media queries.
- **Node.js**, como runtime del servidor.
- **Express 5**, para HTTP, JSON y archivos estáticos.
- **SQLite**, base de datos embebida y local.
- **better-sqlite3**, driver de SQLite para Node.js.
- **Fetch API**, para la comunicación asíncrona frontend-backend.
- **Google Fonts**, para `DM Sans` y `Manrope`.
- **Modo WAL de SQLite**, para mejorar la convivencia entre lecturas y escrituras.

No se observa actualmente un framework de frontend, un ORM, un sistema de autenticación, migraciones formales, tests automatizados ni una configuración específica de despliegue.

## 6. Posibles mejoras y ampliaciones

### Prioridad alta

- Añadir autenticación y autorización si la aplicación se expone fuera del equipo local.
- Incorporar validación de email, teléfono y límites de longitud tanto en backend como en frontend.
- Añadir manejo centralizado de errores y logs estructurados.
- Crear tests de API para altas, validaciones, edición, borrado y casos de registros inexistentes.
- Definir un mecanismo de copias de seguridad de `crm.sqlite` y documentar cómo restaurarlo.
- Añadir un `.gitignore` para evitar versionar `node_modules`, `.DS_Store` y, según la política del proyecto, los archivos de base de datos locales.

### Evolución funcional

- Añadir paginación, ordenación y filtros en el servidor cuando crezca el volumen de leads.
- Registrar historial de cambios, próximas acciones, última interacción y fecha de seguimiento.
- Permitir exportación a CSV/Excel e importación inicial de contactos.
- Añadir etiquetas, fuentes del lead y métricas del embudo de conversión.
- Crear paneles con indicadores: leads por estado, instrumento, responsable y tasa de inscripción.
- Incorporar recordatorios y notificaciones para leads pendientes.
- Añadir detección de duplicados por email o teléfono.

### Evolución técnica

- Separar rutas, validadores, repositorio de datos y configuración en módulos independientes cuando `server.js` crezca.
- Sustituir las opciones hardcodeadas por tablas de configuración o una API de administración.
- Añadir un esquema de migraciones para cambios controlados en la base de datos.
- Incorporar TypeScript o esquemas compartidos para reducir errores entre frontend y backend.
- Añadir pruebas de interfaz y accesibilidad, incluyendo navegación por teclado y mensajes más detallados.
- Preparar configuración por entorno (`PORT`, ubicación de la base de datos, logging y modo de producción).
- Añadir cabeceras de seguridad, rate limiting y protección CSRF si se incorporan sesiones o autenticación basada en cookies.
- Evaluar PostgreSQL u otra base de datos servidor si se necesita acceso multiusuario, concurrencia elevada o despliegue distribuido.

## Nota para continuar el desarrollo

Para ejecutar la aplicación localmente, instalar las dependencias con `npm install` y arrancar el servidor con `npm start`. Después se puede abrir `http://localhost:3001`. El servidor crea automáticamente la base de datos y la tabla si no existen. La configuración actual está pensada para un uso local o de baja concurrencia; antes de publicarla en Internet conviene abordar como mínimo autenticación, copias de seguridad, validación reforzada y protección de la API.
