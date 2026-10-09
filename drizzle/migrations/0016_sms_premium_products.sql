CREATE TABLE public.bot3_premium_products (id serial PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '', price_month numeric NOT NULL, price_year numeric, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot3_premium_products TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bot3_premium_products_id_seq TO service_role;
ALTER TABLE public.bot3_premium_products ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot3_premium_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), telegram_id bigint NOT NULL, product_id integer NOT NULL, product_name text NOT NULL, plan text NOT NULL, charge numeric NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot3_premium_orders TO service_role;
ALTER TABLE public.bot3_premium_orders ENABLE ROW LEVEL SECURITY;
INSERT INTO public.bot3_premium_products(name,description,price_month,price_year) VALUES ('WhatsApp Business Number','Personal dedicated number · fully spam-free · secured',10,100);
CREATE OR REPLACE FUNCTION public.bot3_buy_premium(_user bigint, _product integer, _plan text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p public.bot3_premium_products; price numeric; oid uuid; BEGIN
 SELECT * INTO p FROM public.bot3_premium_products WHERE id=_product AND active;
 IF NOT FOUND THEN RETURN NULL; END IF;
 price := CASE WHEN _plan='year' THEN p.price_year WHEN _plan='month' THEN p.price_month END;
 IF price IS NULL OR price<=0 THEN RETURN NULL; END IF;
 UPDATE public.bot3_users SET balance=balance-price,total_spent=total_spent+price WHERE telegram_id=_user AND NOT is_banned AND balance>=price;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO public.bot3_premium_orders(telegram_id,product_id,product_name,plan,charge) VALUES(_user,p.id,p.name,_plan,price) RETURNING id INTO oid;
 RETURN oid; END $$;
REVOKE EXECUTE ON FUNCTION public.bot3_buy_premium(bigint,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot3_buy_premium(bigint,integer,text) TO service_role;