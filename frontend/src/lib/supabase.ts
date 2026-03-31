import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cgrocgvyiqlsolvgbabq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNncm9jZ3Z5aXFsc29sdmdiYWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NzY0MjQsImV4cCI6MjA5MDQ1MjQyNH0.9z2U_BxzbG87_h2pfG50jLy72bR1qqBy9zoYdYoq2cc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
