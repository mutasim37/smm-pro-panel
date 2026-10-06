CREATE TABLE public.bot_admin_roles (telegram_id bigint PRIMARY KEY, role text NOT NULL DEFAULT 'admin');
GRANT ALL ON public.bot_admin_roles TO service_role;
ALTER TABLE public.bot_admin_roles ENABLE ROW LEVEL SECURITY;