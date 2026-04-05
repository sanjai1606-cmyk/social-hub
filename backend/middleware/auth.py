import os
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

load_dotenv()

security = HTTPBearer()

# Still exported so posts.py optional-auth can fall back to it if needed
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Verify a Supabase Auth JWT by calling auth.get_user().
    Works with both legacy HS256 and the current ECC (P-256 / ES256) signing keys.
    No JWT secret is required on the server side.
    """
    # Import here to avoid circular imports (database imports dotenv too)
    from database import supabase

    token = credentials.credentials
    try:
        response = supabase.auth.get_user(token)
        if not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token"
            )
        return {
            "user_id": response.user.id,
            "email": response.user.email or "",
            "role": response.user.role or "",
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
