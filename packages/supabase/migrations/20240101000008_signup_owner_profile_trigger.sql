-- Sign-up creates public.users via on_auth_user_created before the client can INSERT.
-- Duplicate INSERT from the client fails (PK); owner_profiles step never runs.
-- RLS also blocks clients from promoting role to owner. Fix: derive profile + role + owner_profiles in SECURITY DEFINER trigger.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_role_text text := trim(lower(COALESCE(v_meta->>'role', 'player')));
  v_role public.user_role := 'player';
BEGIN
  IF v_role_text = 'owner' THEN
    v_role := 'owner';
  END IF;

  INSERT INTO public.users (id, name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(v_meta->>'name'), ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    NULLIF(trim(v_meta->>'phone'), ''),
    v_role
  )
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, public.users.name),
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, public.users.phone),
    role = CASE
      WHEN public.users.role = 'admin'::public.user_role THEN public.users.role
      ELSE EXCLUDED.role
    END;

  IF v_role = 'owner' THEN
    INSERT INTO public.owner_profiles (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
