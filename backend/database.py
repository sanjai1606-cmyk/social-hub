import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Use the service role key so server-side writes bypass RLS.
# The FastAPI middleware (get_current_user) already validates the JWT before
# any write operation, so this is safe.
# Falls back to anon key if service role key is not set (reads still work).
_active_key = SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY

supabase: Client = create_client(SUPABASE_URL, _active_key)


def get_admin_client() -> Client:
    """Returns a client with the service role key (bypasses RLS)."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY)
