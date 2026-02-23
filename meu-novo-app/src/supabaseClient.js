import { createClient } from "@supabase/supabase-js/dist/index.cjs";

// 💡 Aula V.I.R.T.U.S: Essas são as chaves da sua casa. 
// Sem elas, o app não entra no banco de dados.
const supabaseUrl = 'https://qhipjdmgqdxzmvsoajnt.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoaXBqZG1ncWR4em12c29ham50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTc5OTMsImV4cCI6MjA4NzE3Mzk5M30.ySfkeJfbz1FcrmM3pKyXzImmgvZe3eiSHQhCqrZFTEo'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)