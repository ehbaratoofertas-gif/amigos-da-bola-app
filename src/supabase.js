import { createClient } from '@supabase/supabase-js';

// As credenciais podem vir de variáveis de ambiente (.env) ou de configuração padrão
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://stidseuudenwdltjrggh.supabase.co";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0aWRzZXV1ZGVud2RsdGpyZ2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MTM2NDEsImV4cCI6MjEwMDE4OTY0MX0.aytikXt_g9eL1Gfrpg0EZQKjz5clR9z6JZCc5G-kwKk";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
