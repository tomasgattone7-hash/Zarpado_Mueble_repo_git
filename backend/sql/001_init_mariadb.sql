CREATE DATABASE IF NOT EXISTS tienda
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tienda;

CREATE TABLE IF NOT EXISTS pedidos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  direccion VARCHAR(150) NOT NULL,
  ciudad VARCHAR(50) NOT NULL,
  provincia VARCHAR(50) NOT NULL,
  codigo_postal VARCHAR(10) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  envio DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  order_id VARCHAR(40) NULL,
  external_reference VARCHAR(60) NULL,
  estado VARCHAR(40) NOT NULL DEFAULT 'draft',
  fecha_creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizado TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pedidos_email (email),
  INDEX idx_pedidos_fecha (fecha_creado),
  INDEX idx_pedidos_estado (estado),
  UNIQUE KEY uniq_order_id (order_id)
) ENGINE=InnoDB;
