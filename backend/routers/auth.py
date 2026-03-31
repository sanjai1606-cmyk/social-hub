from fastapi import APIRouter, HTTPException, status
from models.schemas import RegisterRequest, LoginRequest, AuthResponse
from database import supabase
import traceback

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest):
    """Register a new user with Supabase Auth and create profile."""
    try:
        # Sign up with Supabase Auth + metadata for the trigger
        auth_response = supabase.auth.sign_up({
            "email": req.email,
            "password": req.password,
            "options": {
                "data": {
                    "username": req.username,
                    "display_name": req.display_name
                }
            }
        })

        if not auth_response.user:
            raise HTTPException(status_code=400, detail="Registration failed")

        return AuthResponse(
            access_token=auth_response.session.access_token if auth_response.session else "",
            user_id=auth_response.user.id,
            username=req.username,
            display_name=req.display_name
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Registration failed: {str(e)}")


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    """Login with email and password."""
    try:
        auth_response = supabase.auth.sign_in_with_password({
            "email": req.email,
            "password": req.password
        })

        if not auth_response.user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        user_id = auth_response.user.id

        # Fetch user profile
        profile = supabase.table("users").select("*").eq("user_id", user_id).single().execute()

        access_token = auth_response.session.access_token if auth_response.session else ""

        return AuthResponse(
            access_token=access_token,
            user_id=user_id,
            username=profile.data.get("username", ""),
            display_name=profile.data.get("display_name", ""),
            avatar_url=profile.data.get("avatar_url", "")
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=401, detail=f"Login failed: {str(e)}")


@router.post("/logout")
async def logout():
    """Logout current user."""
    try:
        supabase.auth.sign_out()
        return {"message": "Logged out successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
