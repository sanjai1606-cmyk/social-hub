import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Client using anon key (respects RLS)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# Admin client using service role key (bypasses RLS) - use for admin ops only
def get_admin_client() -> Client:
    key = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
    return create_client(SUPABASE_URL, key)
