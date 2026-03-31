from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List
from models.schemas import (
    CreateCommentRequest, CommentResponse,
    SendMessageRequest, MessageResponse, ConversationPreview,
    NotificationResponse
)
from database import supabase
from middleware.auth import get_current_user

router = APIRouter(tags=["Social"])


# ── LIKES ─────────────────────────────────────────────

@router.post("/posts/{post_id}/like", status_code=201)
async def like_post(post_id: str, current_user: dict = Depends(get_current_user)):
    """Like a post."""
    try:
        supabase.table("likes").insert({
            "post_id": post_id,
            "user_id": current_user["user_id"]
        }).execute()
        return {"message": "Post liked"}
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(status_code=400, detail="Already liked")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/posts/{post_id}/like")
async def unlike_post(post_id: str, current_user: dict = Depends(get_current_user)):
    """Unlike a post."""
    try:
        supabase.table("likes").delete().eq(
            "post_id", post_id
        ).eq("user_id", current_user["user_id"]).execute()
        return {"message": "Post unliked"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── COMMENTS ──────────────────────────────────────────

@router.get("/posts/{post_id}/comments", response_model=List[CommentResponse])
async def get_comments(
    post_id: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """Get comments for a post."""
    try:
        result = supabase.table("comments").select(
            "*, users(username, display_name, avatar_url)"
        ).eq("post_id", post_id).order("created_at", desc=False).limit(limit).offset(offset).execute()

        comments = []
        for row in result.data:
            user = row.get("users", {}) or {}
            comments.append(CommentResponse(
                comment_id=row["comment_id"],
                post_id=row["post_id"],
                user_id=row["user_id"],
                content=row["content"],
                created_at=row["created_at"],
                username=user.get("username", ""),
                display_name=user.get("display_name", ""),
                avatar_url=user.get("avatar_url", ""),
            ))
        return comments

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/posts/{post_id}/comments", response_model=CommentResponse, status_code=201)
async def create_comment(
    post_id: str,
    req: CreateCommentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Add a comment to a post."""
    try:
        result = supabase.table("comments").insert({
            "post_id": post_id,
            "user_id": current_user["user_id"],
            "content": req.content
        }).execute()

        comment = result.data[0]
        user = supabase.table("users").select("username, display_name, avatar_url").eq(
            "user_id", current_user["user_id"]
        ).single().execute()

        return CommentResponse(
            comment_id=comment["comment_id"],
            post_id=comment["post_id"],
            user_id=comment["user_id"],
            content=comment["content"],
            created_at=comment["created_at"],
            username=user.data.get("username", ""),
            display_name=user.data.get("display_name", ""),
            avatar_url=user.data.get("avatar_url", ""),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a comment (owner only)."""
    try:
        comment = supabase.table("comments").select("user_id").eq("comment_id", comment_id).single().execute()
        if comment.data["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Not authorized")

        supabase.table("comments").delete().eq("comment_id", comment_id).execute()
        return {"message": "Comment deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── MESSAGES ──────────────────────────────────────────

@router.get("/messages/conversations", response_model=List[ConversationPreview])
async def get_conversations(current_user: dict = Depends(get_current_user)):
    """Get list of conversations for current user."""
    try:
        uid = current_user["user_id"]
        # Get all messages where user is sender or receiver, get unique conversation partners
        sent = supabase.table("messages").select("receiver_id, content, created_at").eq("sender_id", uid).order("created_at", desc=True).execute()
        received = supabase.table("messages").select("sender_id, content, created_at, is_read").eq("receiver_id", uid).order("created_at", desc=True).execute()

        # Build conversation map
        convos = {}
        for msg in sent.data:
            partner = msg["receiver_id"]
            if partner not in convos:
                convos[partner] = {"last_message": msg["content"], "last_at": msg["created_at"], "unread": 0}

        for msg in received.data:
            partner = msg["sender_id"]
            if partner not in convos:
                convos[partner] = {"last_message": msg["content"], "last_at": msg["created_at"], "unread": 0}
            elif msg["created_at"] > convos[partner]["last_at"]:
                convos[partner]["last_message"] = msg["content"]
                convos[partner]["last_at"] = msg["created_at"]
            if not msg.get("is_read", True):
                convos[partner]["unread"] = convos[partner].get("unread", 0) + 1

        if not convos:
            return []

        # Fetch user info for all conversation partners
        partner_ids = list(convos.keys())
        users_result = supabase.table("users").select("user_id, username, display_name, avatar_url").in_("user_id", partner_ids).execute()
        user_map = {u["user_id"]: u for u in users_result.data}

        result = []
        for pid, data in convos.items():
            u = user_map.get(pid, {})
            result.append(ConversationPreview(
                user_id=pid,
                username=u.get("username", ""),
                display_name=u.get("display_name", ""),
                avatar_url=u.get("avatar_url", ""),
                last_message=data["last_message"],
                last_message_at=data["last_at"],
                unread_count=data["unread"],
            ))

        result.sort(key=lambda x: x.last_message_at, reverse=True)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/messages/{partner_id}", response_model=List[MessageResponse])
async def get_messages(
    partner_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    """Get messages between current user and a partner."""
    try:
        uid = current_user["user_id"]

        result = supabase.table("messages").select(
            "*, users!messages_sender_id_fkey(username, display_name, avatar_url)"
        ).or_(
            f"and(sender_id.eq.{uid},receiver_id.eq.{partner_id}),and(sender_id.eq.{partner_id},receiver_id.eq.{uid})"
        ).order("created_at", desc=False).limit(limit).offset(offset).execute()

        # Mark unread messages from partner as read
        supabase.table("messages").update({"is_read": True}).eq(
            "sender_id", partner_id
        ).eq("receiver_id", uid).eq("is_read", False).execute()

        messages = []
        for row in result.data:
            sender = row.get("users", {}) or {}
            messages.append(MessageResponse(
                message_id=row["message_id"],
                sender_id=row["sender_id"],
                receiver_id=row["receiver_id"],
                content=row["content"],
                is_read=row.get("is_read", False),
                created_at=row["created_at"],
                sender_username=sender.get("username", ""),
                sender_display_name=sender.get("display_name", ""),
                sender_avatar_url=sender.get("avatar_url", ""),
            ))
        return messages

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/messages", response_model=MessageResponse, status_code=201)
async def send_message(
    req: SendMessageRequest,
    current_user: dict = Depends(get_current_user)
):
    """Send a direct message."""
    try:
        result = supabase.table("messages").insert({
            "sender_id": current_user["user_id"],
            "receiver_id": req.receiver_id,
            "content": req.content
        }).execute()

        msg = result.data[0]
        user = supabase.table("users").select("username, display_name, avatar_url").eq(
            "user_id", current_user["user_id"]
        ).single().execute()

        return MessageResponse(
            message_id=msg["message_id"],
            sender_id=msg["sender_id"],
            receiver_id=msg["receiver_id"],
            content=msg["content"],
            is_read=False,
            created_at=msg["created_at"],
            sender_username=user.data.get("username", ""),
            sender_display_name=user.data.get("display_name", ""),
            sender_avatar_url=user.data.get("avatar_url", ""),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── NOTIFICATIONS ─────────────────────────────────────

@router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(
    limit: int = Query(30, ge=1, le=100),
    unread_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get notifications for the current user."""
    try:
        query = supabase.table("notifications").select(
            "*, users!notifications_actor_id_fkey(username, display_name, avatar_url)"
        ).eq("user_id", current_user["user_id"]).order("created_at", desc=True).limit(limit)

        if unread_only:
            query = query.eq("is_read", False)

        result = query.execute()

        notifications = []
        for row in result.data:
            actor = row.get("users", {}) or {}
            notifications.append(NotificationResponse(
                notification_id=row["notification_id"],
                user_id=row["user_id"],
                actor_id=row.get("actor_id"),
                type=row["type"],
                content=row["content"],
                ref_id=row.get("ref_id"),
                is_read=row.get("is_read", False),
                created_at=row["created_at"],
                actor_username=actor.get("username", ""),
                actor_display_name=actor.get("display_name", ""),
                actor_avatar_url=actor.get("avatar_url", ""),
            ))
        return notifications

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/notifications/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    """Mark all notifications as read."""
    try:
        supabase.table("notifications").update({"is_read": True}).eq(
            "user_id", current_user["user_id"]
        ).eq("is_read", False).execute()
        return {"message": "All notifications marked as read"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notifications/unread-count")
async def unread_count(current_user: dict = Depends(get_current_user)):
    """Get unread notification count."""
    try:
        result = supabase.table("notifications").select(
            "notification_id", count="exact"
        ).eq("user_id", current_user["user_id"]).eq("is_read", False).execute()
        return {"count": result.count or 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
