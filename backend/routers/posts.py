import httpx
from fastapi import APIRouter, HTTPException, Depends, Query, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
from models.schemas import PostResponse, CreatePostRequest
from database import supabase
from middleware.auth import get_current_user, SUPABASE_URL, SUPABASE_ANON_KEY

router = APIRouter(prefix="/posts", tags=["Posts"])

# Optional auth bearer — returns None instead of raising 401 when no token
_optional_bearer = HTTPBearer(auto_error=False)


async def _get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(_optional_bearer),
) -> Optional[dict]:
    """Verify token via Supabase Auth API if present; silently return None if missing or invalid."""
    if not credentials or not credentials.credentials:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
            )
        if response.status_code != 200:
            return None
        uid = response.json().get("id")
        return {"user_id": uid} if uid else None
    except Exception:
        return None


def _check_liked(post_id: str, user_id: str) -> bool:
    """Return True if user has liked the given post."""
    result = supabase.table("likes").select("like_id").eq("post_id", post_id).eq("user_id", user_id).execute()
    return len(result.data) > 0


@router.get("", response_model=List[PostResponse])
async def get_posts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: Optional[str] = None,
    current_user: Optional[dict] = Depends(_get_optional_user),
):
    """Get posts (optionally filtered by user). Public endpoint; returns is_liked when authenticated."""
    try:
        query = (
            supabase.table("v_post_summary")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .offset(offset)
        )

        if user_id:
            query = query.eq("user_id", user_id)

        result = query.execute()

        posts = []
        for row in result.data:
            is_liked = _check_liked(row["post_id"], current_user["user_id"]) if current_user else False
            posts.append(
                PostResponse(
                    post_id=row["post_id"],
                    user_id=row["user_id"],
                    content=row["content"],
                    media_url=row.get("media_url", ""),
                    media_type=row.get("media_type", "none"),
                    created_at=row["created_at"],
                    username=row.get("username", ""),
                    display_name=row.get("display_name", ""),
                    avatar_url=row.get("avatar_url", ""),
                    like_count=row.get("like_count", 0),
                    comment_count=row.get("comment_count", 0),
                    is_liked=is_liked,
                )
            )
        return posts

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/feed", response_model=List[PostResponse])
async def get_feed(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    """Get personalized feed for the current user."""
    try:
        result = supabase.rpc(
            "get_user_feed",
            {
                "p_user_id": current_user["user_id"],
                "p_limit": limit,
                "p_offset": offset,
            },
        ).execute()

        posts = []
        for row in result.data:
            is_liked = _check_liked(row["post_id"], current_user["user_id"])
            posts.append(
                PostResponse(
                    post_id=row["post_id"],
                    user_id=row["user_id"],
                    content=row["content"],
                    media_url=row.get("media_url", ""),
                    media_type=row.get("media_type", "none"),
                    created_at=row["created_at"],
                    username=row.get("username", ""),
                    display_name=row.get("display_name", ""),
                    avatar_url=row.get("avatar_url", ""),
                    like_count=row.get("like_count", 0),
                    comment_count=row.get("comment_count", 0),
                    is_liked=is_liked,
                )
            )
        return posts

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=PostResponse, status_code=201)
async def create_post(
    req: CreatePostRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create a new post."""
    try:
        post_data = {
            "user_id": current_user["user_id"],
            "content": req.content,
            "media_url": req.media_url or "",
            "media_type": req.media_type.value,
        }

        result = supabase.table("posts").insert(post_data).execute()
        post = result.data[0]

        # Handle tags
        tags: List[str] = []
        if req.tags:
            for tag_name in req.tags:
                tag_name = tag_name.lower().strip()
                if not tag_name:
                    continue
                tag_result = supabase.table("tags").upsert({"name": tag_name}, on_conflict="name").execute()
                tag_id = tag_result.data[0]["tag_id"]
                supabase.table("post_tags").insert({"post_id": post["post_id"], "tag_id": tag_id}).execute()
                tags.append(tag_name)

        # Fetch user info
        user = (
            supabase.table("users")
            .select("username, display_name, avatar_url")
            .eq("user_id", current_user["user_id"])
            .single()
            .execute()
        )

        return PostResponse(
            post_id=post["post_id"],
            user_id=post["user_id"],
            content=post["content"],
            media_url=post.get("media_url", ""),
            media_type=post.get("media_type", "none"),
            created_at=post["created_at"],
            username=user.data.get("username", ""),
            display_name=user.data.get("display_name", ""),
            avatar_url=user.data.get("avatar_url", ""),
            like_count=0,
            comment_count=0,
            is_liked=False,
            tags=tags,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{post_id}", response_model=PostResponse)
async def get_post(
    post_id: str,
    current_user: Optional[dict] = Depends(_get_optional_user),
):
    """Get a single post by ID."""
    try:
        result = supabase.table("v_post_summary").select("*").eq("post_id", post_id).single().execute()
        row = result.data

        # Get tags
        tags_result = supabase.table("post_tags").select("tags(name)").eq("post_id", post_id).execute()
        tags = [t["tags"]["name"] for t in tags_result.data if t.get("tags")]

        is_liked = _check_liked(post_id, current_user["user_id"]) if current_user else False

        return PostResponse(
            post_id=row["post_id"],
            user_id=row["user_id"],
            content=row["content"],
            media_url=row.get("media_url", ""),
            media_type=row.get("media_type", "none"),
            created_at=row["created_at"],
            username=row.get("username", ""),
            display_name=row.get("display_name", ""),
            avatar_url=row.get("avatar_url", ""),
            like_count=row.get("like_count", 0),
            comment_count=row.get("comment_count", 0),
            is_liked=is_liked,
            tags=tags,
        )

    except Exception as e:
        raise HTTPException(status_code=404, detail="Post not found")


@router.delete("/{post_id}")
async def delete_post(post_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a post (owner only)."""
    try:
        post = supabase.table("posts").select("user_id").eq("post_id", post_id).single().execute()
        if post.data["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Not authorized")

        supabase.table("posts").delete().eq("post_id", post_id).execute()
        return {"message": "Post deleted"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
