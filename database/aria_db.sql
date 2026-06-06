SET FOREIGN_KEY_CHECKS = 0;

DROP DATABASE IF EXISTS aria_db;
CREATE DATABASE aria_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aria_db;

SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET time_zone = '+00:00';
SET NAMES utf8mb4;

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password VARCHAR(255) NOT NULL DEFAULT '',
  rol ENUM('ciudadano','entidad','administrador') NOT NULL DEFAULT 'ciudadano',
  email_verificado TINYINT(1) NOT NULL DEFAULT 0,
  bloqueado TINYINT(1) NOT NULL DEFAULT 0,
  google_id VARCHAR(120) NULL,
  foto_perfil VARCHAR(500) NULL,
  nit VARCHAR(50) NULL,
  nombre_organizacion VARCHAR(150) NULL,
  tipo_entidad ENUM('veterinaria','fundacion','autoridad_ambiental','rescatista_organizado','hogar_temporal','otra') NULL,
  telefono_oficial VARCHAR(30) NULL,
  telefono VARCHAR(30) NULL,
  ciudad VARCHAR(100) NULL,
  direccion_sede VARCHAR(200) NULL,
  direccion VARCHAR(200) NULL,
  zona_operacion VARCHAR(200) NULL,
  representante VARCHAR(100) NULL,
  descripcion_entidad TEXT NULL,
  servicios_ofrecidos VARCHAR(500) NULL,
  enlace_verificacion VARCHAR(255) NULL,
  aprobacion_pendiente TINYINT(1) NOT NULL DEFAULT 0,
  estado_aprobacion ENUM('pendiente','aprobada','rechazada','bloqueada') NOT NULL DEFAULT 'aprobada',
  aprobado_por INT NULL,
  aprobado_en DATETIME NULL,
  rechazado_por INT NULL,
  rechazado_en DATETIME NULL,
  motivo_rechazo TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_email (email),
  UNIQUE KEY uq_usuarios_google_id (google_id),
  UNIQUE KEY uq_usuarios_nit (nit),
  KEY idx_usuarios_rol (rol),
  KEY idx_usuarios_email_verificado (email_verificado),
  KEY idx_usuarios_estado_aprobacion (estado_aprobacion),
  KEY idx_usuarios_bloqueado (bloqueado),
  KEY idx_usuarios_aprobacion_pendiente (aprobacion_pendiente),
  KEY idx_usuarios_aprobado_por (aprobado_por),
  KEY idx_usuarios_rechazado_por (rechazado_por),
  CONSTRAINT fk_usuarios_aprobado_por FOREIGN KEY (aprobado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_usuarios_rechazado_por FOREIGN KEY (rechazado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reportes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  especie VARCHAR(100) NOT NULL,
  descripcion TEXT NOT NULL,
  ubicacion VARCHAR(255) NOT NULL,
  latitud DECIMAL(10,8) NULL,
  longitud DECIMAL(11,8) NULL,
  foto VARCHAR(500) NOT NULL,
  estado ENUM('pendiente','en_atencion','rescatado','no_procede','requiere_revision') NOT NULL DEFAULT 'pendiente',
  categoria ENUM('abandono','herido','enfermo','maltrato','cautiverio','fauna_silvestre','no_estoy_seguro') NOT NULL DEFAULT 'no_estoy_seguro',
  prioridad ENUM('normal','urgente') NOT NULL DEFAULT 'normal',
  reportadoPor VARCHAR(100) NULL,
  usuario_id INT NULL,
  entidad_asignada_id INT NULL,
  especie_detectada VARCHAR(100) NULL,
  especie_ia VARCHAR(100) NULL,
  es_animal_verificado TINYINT(1) NOT NULL DEFAULT 0,
  validacion_ia TINYINT(1) NOT NULL DEFAULT 0,
  confianza_ia DECIMAL(5,2) NULL,
  reportado_invalido TINYINT(1) NOT NULL DEFAULT 0,
  motivo_reporte TEXT NULL,
  motivo_invalido TEXT NULL,
  tipo_reporte_invalido ENUM('posible_falso','no_corresponde') NULL,
  notas_rescate TEXT NULL,
  nota_entidad TEXT NULL,
  asumido_en DATETIME NULL,
  rescatado_en DATETIME NULL,
  fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_reportes_usuario (usuario_id),
  KEY idx_reportes_entidad (entidad_asignada_id),
  KEY idx_reportes_estado (estado),
  KEY idx_reportes_categoria (categoria),
  KEY idx_reportes_prioridad (prioridad),
  KEY idx_reportes_fecha (fecha),
  CONSTRAINT fk_reportes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_reportes_entidad FOREIGN KEY (entidad_asignada_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mascotas_perdidas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  especie VARCHAR(100) NOT NULL,
  descripcion TEXT NOT NULL,
  zona VARCHAR(200) NOT NULL,
  contacto VARCHAR(50) NOT NULL,
  foto VARCHAR(500) NOT NULL,
  estado ENUM('perdido','encontrado','cerrada') NOT NULL DEFAULT 'perdido',
  validacion_ia TINYINT(1) NOT NULL DEFAULT 0,
  especie_ia VARCHAR(100) NULL,
  especie_detectada VARCHAR(100) NULL,
  es_animal_verificado TINYINT(1) NOT NULL DEFAULT 0,
  confianza_ia DECIMAL(5,2) NULL,
  fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  encontrado_en DATETIME NULL,
  cerrada_en DATETIME NULL,
  KEY idx_mascotas_usuario (usuario_id),
  KEY idx_mascotas_estado (estado),
  KEY idx_mascotas_zona (zona),
  KEY idx_mascotas_fecha (fecha),
  CONSTRAINT fk_mascotas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notificaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  reporte_id INT NULL,
  tipo VARCHAR(50) NULL,
  titulo VARCHAR(150) NOT NULL,
  mensaje TEXT NOT NULL,
  leida TINYINT(1) NOT NULL DEFAULT 0,
  fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notificaciones_usuario (usuario_id),
  KEY idx_notificaciones_leida (leida),
  KEY idx_notificaciones_reporte (reporte_id),
  KEY idx_notificaciones_fecha (fecha),
  CONSTRAINT fk_notificaciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_notificaciones_reporte FOREIGN KEY (reporte_id) REFERENCES reportes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE verificaciones_otp (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(150) NOT NULL,
  codigo VARCHAR(10) NOT NULL,
  expira_en DATETIME NOT NULL,
  usado TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_otp_email (email),
  KEY idx_otp_codigo (codigo),
  KEY idx_otp_usado (usado),
  KEY idx_otp_expira_en (expira_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tokens_recuperacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  token VARCHAR(255) NOT NULL,
  expira_en DATETIME NOT NULL,
  usado TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tokens_usuario (usuario_id),
  KEY idx_tokens_token (token),
  KEY idx_tokens_usado (usado),
  KEY idx_tokens_expira_en (expira_en),
  CONSTRAINT fk_tokens_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
