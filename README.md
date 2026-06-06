# ARIA Backend

Backend del proyecto ARIA, una plataforma para reportar animales en situacion de riesgo, gestionar casos por entidades y publicar mascotas perdidas.

Este repositorio contiene la API principal, la integracion con servicios externos y el microservicio de IA usado para validacion de imagenes.

## Tecnologias

- Node.js
- Express.js
- MySQL / MariaDB
- mysql2
- JWT
- Passport.js
- Google OAuth 2.0
- bcryptjs
- Multer
- Cloudinary
- Resend
- Google Gemini
- Docker Compose

## Estructura principal

```txt
index.js                  Punto de entrada de la API
src/routes/               Rutas HTTP del backend
src/controllers/          Logica de reportes, mascotas y notificaciones
src/middlewares/          Autenticacion y permisos
src/config/               Configuracion de servicios externos
src/utils/                Constantes y utilidades compartidas
ia-service/               Microservicio de validacion con Gemini
database/aria_db.sql      Script SQL para inicializar la base de datos
test/                     Pruebas automaticas basicas
```

## Variables de entorno

El backend usa `.env` para ejecucion normal con Node.js.

Variables principales:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=aria_db

JWT_SECRET=
SESSION_SECRET=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

RESEND_API_KEY=
GEMINI_API_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
FRONTEND_URL=http://localhost:5173
IA_SERVICE_URL=http://localhost:4000
```

No subas `.env` al repositorio.

## Ejecucion sin Docker

Instalar dependencias:

```powershell
npm install
```

Ejecutar backend en modo desarrollo:

```powershell
npm run dev
```

Ejecutar en modo normal:

```powershell
npm start
```

Ejecutar pruebas:

```powershell
npm test
```

## IA Service

El microservicio de IA vive en `ia-service/` y corre en el puerto `4000`.

```powershell
cd ia-service
npm install
npm run dev
```

Endpoint base:

```txt
GET http://localhost:4000
```

## Docker Compose

El proyecto puede levantarse completo con Docker Compose:

- MySQL
- Backend
- IA Service
- Frontend

La guia detallada esta en:

```txt
DOCKER.md
```

Comando principal usando `.env`:

```powershell
docker compose up -d --build
```

Comando alternativo usando `docker.env`:

```powershell
docker compose --env-file docker.env up -d --build
```

Verificar servicios:

```powershell
docker compose ps
```

## Endpoints principales

```txt
/api/auth
/api/reportes
/api/mascotas-perdidas
/api/admin
/api/notificaciones
/api/validar-animal
/api/health
```

Healthcheck:

```txt
GET http://localhost:3000/api/health
```

## Base de datos

El esquema principal se encuentra en:

```txt
database/aria_db.sql
```

Tablas principales:

- usuarios
- reportes
- mascotas_perdidas
- notificaciones
- verificaciones_otp
- tokens_recuperacion

## Roles del sistema

- ciudadano
- entidad
- administrador

## Seguridad

- No subir `.env`.
- No subir `docker.env`.
- No subir `node_modules`.
- No subir credenciales de Cloudinary, Resend, Gemini o Google OAuth.
- Usar ramas y pull requests para integrar cambios.
