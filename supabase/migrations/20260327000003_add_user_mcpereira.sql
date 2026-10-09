-- Migration: Adiciona usuário mcpereira39@gmail.com ao dashboard
INSERT INTO dashboard_users (client_id, email, password, is_support)
SELECT id, 'mcpereira39@gmail.com', 'Mm43615773', FALSE
  FROM clients
 LIMIT 1
ON CONFLICT (client_id, email) DO UPDATE
  SET password = EXCLUDED.password;
