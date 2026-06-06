# ARIA con Docker Compose

Esta guia explica como ejecutar ARIA de forma local con Docker Compose.

La idea es levantar el sistema completo desde Visual Studio Code sin depender de XAMPP, ni de una version local especifica de Node.js o MySQL.

## Que levanta Docker

Docker Compose inicia cuatro servicios conectados entre si:

- MySQL: base de datos del proyecto.
- IA Service: microservicio de validacion de imagenes con Gemini.
- Backend: API principal de ARIA en Node.js y Express.
- Frontend: aplicacion React compilada y servida con Nginx.

## Puertos locales

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Health backend: http://localhost:3000/api/health
- IA Service: http://localhost:4000
- MySQL Docker: localhost:3307

MySQL se publica en el puerto 3307 para no chocar con XAMPP, que normalmente usa el puerto 3306.

## Estructura esperada

El archivo `docker-compose.yml` esta en el repositorio backend, pero tambien construye el frontend desde su carpeta separada.

Estructura usada en este equipo:

```txt
Music/
  Diplomado backend/
    aria-backend/
  Diplomado Frontend/
    aria-frontend/
```

Si otro integrante tiene el frontend en una ruta diferente, puede agregar esta variable en su archivo de entorno:

```env
ARIA_FRONTEND_PATH=C:/ruta/donde/esta/aria-frontend
```

Si no se define, Docker usa la ruta relativa configurada para esta estructura de carpetas.

## Variables de entorno

El proyecto tiene dos plantillas de entorno:

- `.env.example`: plantilla para correr backend e IA Service de forma local sin Docker.
- `docker.env.example`: plantilla para correr todo con Docker Compose.

Para correr sin Docker, copia `.env.example` como `.env` y completa los valores reales.

Para correr con Docker, copia `docker.env.example` como `docker.env` y completa los valores reales.

Los archivos `.env` y `docker.env` contienen credenciales reales y no deben subirse al repositorio.

Variables importantes para Docker:

```env
ARIA_FRONTEND_PATH=../aria-frontend
FRONTEND_URL=http://localhost:5173
VITE_API_URL=http://localhost:3000/api
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

La base de datos dentro de Docker usa MySQL propio. `MYSQL_ROOT_PASSWORD` se define en `docker.env`.

El backend tambien usa reintentos controlados para conectarse a MySQL durante el arranque:

```env
DB_CONNECT_RETRIES=10
DB_CONNECT_RETRY_DELAY_MS=3000
```

Esto evita fallos visibles si MySQL tarda unos segundos adicionales en aceptar conexiones.

## Levantar todo el proyecto con docker.env

Abre Docker Desktop.

Luego, desde Visual Studio Code, abre una terminal en la carpeta del backend:

```powershell
cd "C:\Users\Crist\Music\Diplomado backend\aria-backend"
```

Si todavia no existe `docker.env`, crealo desde la plantilla:

```powershell
copy docker.env.example docker.env
```

Despues completa `docker.env` con las credenciales reales y ejecuta:

```powershell
docker compose --env-file docker.env up -d --build
```

Este comando construye y levanta MySQL, IA Service, backend y frontend.

## Verificar que todo este corriendo

```powershell
docker compose --env-file docker.env ps
```

Los servicios deben aparecer como `healthy`:

- `aria-mysql`
- `aria-ia-service`
- `aria-backend`
- `aria-frontend`

Tambien se puede probar en el navegador:

```txt
http://localhost:5173
http://localhost:3000/api/health
http://localhost:4000
http://localhost:5173/health
```

## Ver logs

Backend:

```powershell
docker compose logs -f backend
```

IA Service:

```powershell
docker compose logs -f ia-service
```

Frontend:

```powershell
docker compose logs -f frontend
```

## Crear usuario administrador en Docker

Cuando los contenedores esten corriendo, ejecuta:

```powershell
docker compose exec backend node scripts/crear-admin.js --nombre="Administrador ARIA" --email="admin@aria.com" --password="Admin2026!"
```

Despues puedes ingresar desde:

```txt
http://localhost:5173/login
```

## Detener el proyecto

```powershell
docker compose --env-file docker.env down
```

## Reiniciar la base de datos de Docker

Este comando borra solo la base de datos creada dentro de Docker. No toca XAMPP ni bases externas.

```powershell
docker compose --env-file docker.env down -v
docker compose --env-file docker.env up -d --build
```

## Que hace cada archivo Docker

- `docker-compose.yml`: coordina todos los servicios y sus conexiones.
- `Dockerfile`: construye la imagen del backend.
- `ia-service/Dockerfile`: construye la imagen del microservicio de IA.
- `../aria-frontend/Dockerfile`: compila React y lo sirve con Nginx.
- `../aria-frontend/nginx.conf`: configura Nginx para servir la SPA y responder `/health`.
- `.dockerignore`: evita copiar `node_modules`, `.env`, `dist` y archivos innecesarios a la imagen.

## Si aparece un warning de permisos de Docker en Windows

En algunos equipos Docker puede mostrar este mensaje:

```txt
Error loading config file: open C:\Users\Crist\.docker\config.json: Access is denied
```

Si el comando termina correctamente, es solo una advertencia de permisos del archivo de configuracion local de Docker Desktop.

Si se quiere evitar el warning en la terminal, se puede usar una configuracion local ignorada por Git:

```powershell
New-Item -ItemType Directory -Force .docker-config | Out-Null
$env:DOCKER_CONFIG = (Resolve-Path .docker-config).Path
docker compose up -d --build
```

Ese ajuste solo aplica a la terminal actual.

## Notas importantes

- No se necesita XAMPP mientras se usa Docker.
- No se suben credenciales al repositorio.
- No se sube `.env`.
- No se sube `docker.env` si se decide usarlo.
- No se sube `node_modules`.
- Docker Compose valida el orden de arranque con healthchecks.
- El backend espera a MySQL y al IA Service antes de iniciar completamente.
- El frontend espera a que el backend este saludable antes de publicarse.
