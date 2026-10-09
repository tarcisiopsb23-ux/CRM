-- Migration: 20260501000006_drop_legacy_rpcs.sql
-- Remove RPCs de autenticação legados substituídos pelo SaaS Auth
DROP FUNCTION IF EXISTS validate_client_dashboard_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS validate_support_password(TEXT);
DROP FUNCTION IF EXISTS get_client_data();
-- Manter por ora: update_client_dashboard_password, recover_client_password
