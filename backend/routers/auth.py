from fastapi import APIRouter, HTTPException, status
from models.schemas import RegisterRequest, LoginRequest, AuthResponse
from database import supabase
import traceback

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest):
    """
    Register a new user.
    Uses the admin API to create an auto-confirmed user (no email verification needed),
    then immediately signs in to return a valid access token.
    """
    # Step 1: Create user via admin API with email_confirm=True
    # This bypasses Supabase's email confirmation requirement.
    try:
        admin_result = supabase.auth.admin.create_user({
            "email": req.email,
            "password": req.password,
            "email_confirm": True,
            "user_metadata": {
                "username": req.username,
                "display_name": req.display_name
            }
        })
        if not admin_result.user:
            raise HTTPException(status_code=400, detail="Registration failed: could not create user")
        user_id = admin_result.user.id
    except HTTPException:
        raise
    except Exception as e:
        err = str(e).lower()
        if "already registered" in err or "already been registered" in err or "already exists" in err:
            raise HTTPException(status_code=400, detail="Email already registered")
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Registration failed: {str(e)}")

    # Step 2: Sign in to get a valid session/access token
    try:
        sign_in = supabase.auth.sign_in_with_password({
            "email": req.email,
            "password": req.password
        })
        if not sign_in.session:
            raise HTTPException(status_code=400, detail="Registration succeeded but sign-in failed")
        access_token = sign_in.session.access_token
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Sign-in after registration failed: {str(e)}")

    # Step 3: Fetch the user profile created by the DB trigger (handle_new_user)
    try:
        profile = supabase.table("users").select("username, display_name, avatar_url").eq("user_id", user_id).single().execute()
        username = profile.data.get("username", req.username)
        display_name = profile.data.get("display_name", req.display_name)
        avatar_url = profile.data.get("avatar_url", "")
    except Exception:
        # Trigger may not have fired yet in edge cases — fall back to request data
        username = req.username
        display_name = req.display_name
        avatar_url = ""

    return AuthResponse(
        access_token=access_token,
        user_id=user_id,
        username=username,
        display_name=display_name,
        avatar_url=avatar_url
    )


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

        if not auth_response.session:
            raise HTTPException(status_code=401, detail="Login failed: no session returned")

        user_id = auth_response.user.id
        access_token = auth_response.session.access_token

        # Fetch user profile
        profile = supabase.table("users").select("*").eq("user_id", user_id).single().execute()

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
