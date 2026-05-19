-- CRM: leads pipeline for sales team (internal, admin-only)
-- Access is enforced at the application layer (admin role check in layout + actions)

CREATE TABLE public.crm_leads (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name        text        NOT NULL,
  business_name     text,
  city              text,
  phone             text,
  email             text,
  stage             text        NOT NULL DEFAULT 'nuevo'
                               CHECK (stage IN ('nuevo','contactado','demo','negociacion','ganado','perdido')),
  source            text,       -- referido, instagram, whatsapp, feria, etc.
  assigned_to       text,       -- name of sales rep
  notes_count       integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.crm_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid        NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  body        text        NOT NULL,
  created_by  text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Keep notes_count in sync
CREATE OR REPLACE FUNCTION public.sync_crm_notes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.crm_leads SET notes_count = notes_count + 1, updated_at = now() WHERE id = NEW.lead_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.crm_leads SET notes_count = GREATEST(0, notes_count - 1), updated_at = now() WHERE id = OLD.lead_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_crm_notes_count
AFTER INSERT OR DELETE ON public.crm_notes
FOR EACH ROW EXECUTE FUNCTION public.sync_crm_notes_count();

-- Update updated_at on lead edits
CREATE OR REPLACE FUNCTION public.set_crm_lead_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_lead_updated_at
BEFORE UPDATE ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION public.set_crm_lead_updated_at();

-- RLS: admin-only via service role in app layer; block direct client access
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;

-- No policies = all access blocked for non-service-role clients
-- App layer uses createAdminClient() (service role) for all CRM queries

-- Indexes
CREATE INDEX idx_crm_leads_stage ON public.crm_leads(stage);
CREATE INDEX idx_crm_leads_created_at ON public.crm_leads(created_at DESC);
CREATE INDEX idx_crm_notes_lead_id ON public.crm_notes(lead_id);
