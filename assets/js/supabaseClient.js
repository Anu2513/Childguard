// assets/js/supabaseClient.js
// assets/js/supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = "https://afpzmewjkyqsxcbcsgpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmcHptZXdqa3lxc3hjYmNzZ3BhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwNTQ2ODksImV4cCI6MjA3NzYzMDY4OX0.G1pTvh7kFjTAKA2Lz5uH5pXBBvtwmA8rXuQY70Ok4As";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;