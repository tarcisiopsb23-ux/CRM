-- Migration: 00054_add_resend_integration_type.sql
-- Description: Add 'resend' to the integration_type enum.

ALTER TYPE integration_type ADD VALUE IF NOT EXISTS 'resend';
