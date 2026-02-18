-- Ajustar usuario/host/contraseña según entorno.
-- Recomendación: usar un host específico en lugar de '%' cuando sea posible.

CREATE USER IF NOT EXISTS 'tienda_app'@'localhost'
  IDENTIFIED BY 'CAMBIAR_POR_PASSWORD_SEGURA';

-- Requerir TLS para conexiones remotas (si aplica).
ALTER USER 'tienda_app'@'localhost' REQUIRE SSL;

GRANT SELECT, INSERT, UPDATE
  ON tienda.pedidos
  TO 'tienda_app'@'localhost';

FLUSH PRIVILEGES;
