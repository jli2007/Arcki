import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface ModelMetadata {
  id: string;
  name: string;
  description?: string;
  glb_url: string;
  thumbnail_url: string;
  category?: string;
  file_size: number;
  created_at: string;
}
