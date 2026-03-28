import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─────────────────────────────────────────────
// SCHEMA SQL — corre isto no Supabase SQL Editor
// ─────────────────────────────────────────────
/*

-- PROFILES (utilizadores)
CREATE TABLE profiles (
  id          uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name        text NOT NULL,
  role        text NOT NULL CHECK (role IN ('mae','pai','avo_m','avo_p','tio','tia','primo','outro')),
  avatar_url  text,
  created_at  timestamptz DEFAULT now()
);

-- CRIANÇAS
CREATE TABLE children (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  birthdate   date NOT NULL,
  avatar_url  text,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

-- AGREGADO FAMILIAR (pais da criança)
CREATE TABLE family_members (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id    uuid REFERENCES children(id) ON DELETE CASCADE,
  profile_id  uuid REFERENCES profiles(id) ON DELETE CASCADE,
  is_parent   boolean DEFAULT false,   -- pais têm acesso total
  approved    boolean DEFAULT true,    -- pais ficam aprovados automaticamente
  added_by    uuid REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(child_id, profile_id)
);

-- CUIDADORES (aprovados pelos pais — acesso total temporário)
CREATE TABLE caregivers (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id     uuid REFERENCES children(id) ON DELETE CASCADE,
  profile_id   uuid REFERENCES profiles(id) ON DELETE CASCADE,
  approved_by  uuid REFERENCES profiles(id),
  approved     boolean DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(child_id, profile_id)
);

-- CONVITES (link de convite para juntar ao agregado ou cuidador)
CREATE TABLE invites (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id    uuid REFERENCES children(id) ON DELETE CASCADE,
  token       text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
  invite_type text NOT NULL CHECK (invite_type IN ('parent','caregiver')),
  created_by  uuid REFERENCES profiles(id),
  used_by     uuid REFERENCES profiles(id),
  used_at     timestamptz,
  expires_at  timestamptz DEFAULT (now() + interval '7 days'),
  created_at  timestamptz DEFAULT now()
);

-- SONO
CREATE TABLE sleep_events (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id    uuid REFERENCES children(id) ON DELETE CASCADE,
  data_date   date NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  recorded_by uuid REFERENCES profiles(id),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(child_id, data_date)
);

-- MAMADAS
CREATE TABLE feeds (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id    uuid REFERENCES children(id) ON DELETE CASCADE,
  data_date   date NOT NULL,
  hora        text NOT NULL,
  duracao_seg int,
  lado        text,
  obs         text,
  recorded_by uuid REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now()
);

-- REFEIÇÕES
CREATE TABLE meals (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id    uuid REFERENCES children(id) ON DELETE CASCADE,
  data_date   date NOT NULL,
  hora        text NOT NULL,
  descricao   text NOT NULL,
  obs         text,
  recorded_by uuid REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now()
);

-- REGISTOS MÉDICOS
CREATE TABLE medical_records (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id    uuid REFERENCES children(id) ON DELETE CASCADE,
  data_date   date NOT NULL,
  hora        text,
  tipo        text NOT NULL CHECK (tipo IN ('sintoma','medicamento','consulta','vacina','outro')),
  titulo      text NOT NULL,
  descricao   text,
  valor       text,   -- febre: 38.5°C, medicamento: dosagem
  recorded_by uuid REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now()
);

-- RLS POLICIES

ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE children        ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE caregivers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE feeds           ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;

-- Profiles: cada um vê o seu; todos veem os outros (para nomes)
CREATE POLICY "own_profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "view_others" ON profiles FOR SELECT USING (true);

-- Children: vê se for membro da família ou cuidador aprovado
CREATE POLICY "children_access" ON children FOR SELECT USING (
  EXISTS (SELECT 1 FROM family_members WHERE child_id = children.id AND profile_id = auth.uid() AND approved = true)
  OR EXISTS (SELECT 1 FROM caregivers WHERE child_id = children.id AND profile_id = auth.uid() AND approved = true)
  OR created_by = auth.uid()
);
CREATE POLICY "children_insert" ON children FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "children_update" ON children FOR UPDATE USING (
  EXISTS (SELECT 1 FROM family_members WHERE child_id = children.id AND profile_id = auth.uid() AND is_parent = true)
);

-- Family members
CREATE POLICY "family_select" ON family_members FOR SELECT USING (
  profile_id = auth.uid() OR
  EXISTS (SELECT 1 FROM family_members fm2 WHERE fm2.child_id = family_members.child_id AND fm2.profile_id = auth.uid())
);
CREATE POLICY "family_insert" ON family_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Caregivers
CREATE POLICY "caregiver_select" ON caregivers FOR SELECT USING (
  profile_id = auth.uid() OR
  EXISTS (SELECT 1 FROM family_members WHERE child_id = caregivers.child_id AND profile_id = auth.uid() AND is_parent = true)
);
CREATE POLICY "caregiver_insert" ON caregivers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "caregiver_update" ON caregivers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM family_members WHERE child_id = caregivers.child_id AND profile_id = auth.uid() AND is_parent = true)
);

-- Invites
CREATE POLICY "invites_select" ON invites FOR SELECT USING (
  created_by = auth.uid() OR
  EXISTS (SELECT 1 FROM family_members WHERE child_id = invites.child_id AND profile_id = auth.uid() AND is_parent = true)
);
CREATE POLICY "invites_insert" ON invites FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM family_members WHERE child_id = invites.child_id AND profile_id = auth.uid() AND is_parent = true)
  OR EXISTS (SELECT 1 FROM children WHERE id = invites.child_id AND created_by = auth.uid())
);
CREATE POLICY "invites_update" ON invites FOR UPDATE USING (true);

-- Sleep, feeds, meals, medical: acesso se tiver ligação à criança
CREATE POLICY "sleep_access" ON sleep_events FOR ALL USING (
  EXISTS (SELECT 1 FROM family_members WHERE child_id = sleep_events.child_id AND profile_id = auth.uid() AND approved = true)
  OR EXISTS (SELECT 1 FROM caregivers WHERE child_id = sleep_events.child_id AND profile_id = auth.uid() AND approved = true)
);
CREATE POLICY "feeds_access" ON feeds FOR ALL USING (
  EXISTS (SELECT 1 FROM family_members WHERE child_id = feeds.child_id AND profile_id = auth.uid() AND approved = true)
  OR EXISTS (SELECT 1 FROM caregivers WHERE child_id = feeds.child_id AND profile_id = auth.uid() AND approved = true)
);
CREATE POLICY "meals_access" ON meals FOR ALL USING (
  EXISTS (SELECT 1 FROM family_members WHERE child_id = meals.child_id AND profile_id = auth.uid() AND approved = true)
  OR EXISTS (SELECT 1 FROM caregivers WHERE child_id = meals.child_id AND profile_id = auth.uid() AND approved = true)
);
CREATE POLICY "medical_access" ON medical_records FOR ALL USING (
  EXISTS (SELECT 1 FROM family_members WHERE child_id = medical_records.child_id AND profile_id = auth.uid() AND approved = true)
  OR EXISTS (SELECT 1 FROM caregivers WHERE child_id = medical_records.child_id AND profile_id = auth.uid() AND approved = true)
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE sleep_events, feeds, meals, medical_records, caregivers;

-- Storage bucket para avatares e fotos
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
CREATE POLICY "avatar_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);
CREATE POLICY "avatar_read"   ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatar_delete" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

*/
