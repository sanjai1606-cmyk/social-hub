from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from models.schemas import UserProfile, UpdateProfileRequest
from database import supabase
from middleware.auth import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserProfile)
async def get_current_profile(current_user: dict = Depends(get_current_user)):
    """Get current user's profile."""
    return await get_user_profile(current_user["user_id"], current_user["user_id"])


@router.get("/search", response_model=List[UserProfile])
async def search_users(
    q: str = Query(min_length=1),
    limit: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user)
):
    """Search users by username (fuzzy search)."""
    try:
        result = supabase.table("users").select("*").ilike("username", f"%{q}%").limit(limit).execute()

        profiles = []
        for u in result.data:
            profile = await _build_profile(u, current_user["user_id"])
            profiles.append(profile)
        return profiles

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}", response_model=UserProfile)
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get a user's profile by ID."""
    return await get_user_profile(user_id, current_user["user_id"])


@router.put("/me", response_model=UserProfile)
async def update_profile(
    req: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update current user's profile."""
    try:
        update_data = {}
        if req.display_name is not None:
            update_data["display_name"] = req.display_name
        if req.bio is not None:
            update_data["bio"] = req.bio
        if req.avatar_url is not None:
            update_data["avatar_url"] = req.avatar_url
        if req.cover_url is not None:
            update_data["cover_url"] = req.cover_url

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        supabase.table("users").update(update_data).eq("user_id", current_user["user_id"]).execute()

        return await get_user_profile(current_user["user_id"], current_user["user_id"])

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{user_id}/follow")
async def follow_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Follow a user."""
    if user_id == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")

    try:
        supabase.table("follows").insert({
            "follower_id": current_user["user_id"],
            "followee_id": user_id
        }).execute()
        return {"message": "Followed successfully"}

    except Exception as e:
        if "duplicate" in str(e).lower():
            raise HTTPException(status_code=400, detail="Already following")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{user_id}/follow")
async def unfollow_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Unfollow a user."""
    try:
        supabase.table("follows").delete().eq(
            "follower_id", current_user["user_id"]
        ).eq("followee_id", user_id).execute()
        return {"message": "Unfollowed successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}/followers", response_model=List[UserProfile])
async def get_followers(
    user_id: str,
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Get a user's followers."""
    try:
        follows = supabase.table("follows").select("follower_id").eq("followee_id", user_id).limit(limit).execute()
        follower_ids = [f["follower_id"] for f in follows.data]

        if not follower_ids:
            return []

        users = supabase.table("users").select("*").in_("user_id", follower_ids).execute()
        return [await _build_profile(u, current_user["user_id"]) for u in users.data]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}/following", response_model=List[UserProfile])
async def get_following(
    user_id: str,
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Get users a user is following."""
    try:
        follows = supabase.table("follows").select("followee_id").eq("follower_id", user_id).limit(limit).execute()
        followee_ids = [f["followee_id"] for f in follows.data]

        if not followee_ids:
            return []

        users = supabase.table("users").select("*").in_("user_id", followee_ids).execute()
        return [await _build_profile(u, current_user["user_id"]) for u in users.data]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def get_user_profile(user_id: str, viewer_id: str) -> UserProfile:
    """Helper to build a full user profile."""
    try:
        result = supabase.table("users").select("*").eq("user_id", user_id).single().execute()
        return await _build_profile(result.data, viewer_id)
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")


async def _build_profile(user_data: dict, viewer_id: str) -> UserProfile:
    """Build UserProfile with follower/following/post/connection counts and is_following."""
    uid = user_data["user_id"]

    followers = supabase.table("follows").select("follower_id", count="exact").eq("followee_id", uid).execute()
    following = supabase.table("follows").select("followee_id", count="exact").eq("follower_id", uid).execute()
    posts = supabase.table("posts").select("post_id", count="exact").eq("user_id", uid).execute()

    # Connection count (accepted connections from either direction)
    conn_as_req = supabase.table("connections").select("connection_id", count="exact").eq("requester_id", uid).eq("status", "accepted").execute()
    conn_as_addr = supabase.table("connections").select("connection_id", count="exact").eq("addressee_id", uid).eq("status", "accepted").execute()
    connection_count = (conn_as_req.count or 0) + (conn_as_addr.count or 0)

    is_following = False
    if viewer_id and viewer_id != uid:
        check = supabase.table("follows").select("follower_id").eq("follower_id", viewer_id).eq("followee_id", uid).execute()
        is_following = len(check.data) > 0

    return UserProfile(
        user_id=uid,
        username=user_data.get("username", ""),
        display_name=user_data.get("display_name", ""),
        bio=user_data.get("bio", ""),
        avatar_url=user_data.get("avatar_url", ""),
        cover_url=user_data.get("cover_url", ""),
        follower_count=followers.count or 0,
        following_count=following.count or 0,
        post_count=posts.count or 0,
        connection_count=connection_count,
        is_following=is_following,
    )
