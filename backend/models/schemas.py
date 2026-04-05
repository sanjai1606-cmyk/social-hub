from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ── Auth ──────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)
    username: str = Field(min_length=3, max_length=30)
    display_name: str = Field(min_length=1, max_length=50)

class LoginRequest(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    access_token: str
    user_id: str
    username: str
    display_name: str
    avatar_url: str = ""


# ── Users ─────────────────────────────────────────────
class UserProfile(BaseModel):
    user_id: str
    username: str
    display_name: str
    bio: str = ""
    avatar_url: str = ""
    cover_url: str = ""
    follower_count: int = 0
    following_count: int = 0
    post_count: int = 0
    connection_count: int = 0
    is_following: bool = False

class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    cover_url: Optional[str] = None


# ── Posts ─────────────────────────────────────────────
class MediaType(str, Enum):
    image = "image"
    video = "video"
    none = "none"

class CreatePostRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    media_url: Optional[str] = None
    media_type: MediaType = MediaType.none
    tags: Optional[List[str]] = None

class PostResponse(BaseModel):
    post_id: str
    user_id: str
    content: str
    media_url: str = ""
    media_type: str = "none"
    created_at: str
    username: str = ""
    display_name: str = ""
    avatar_url: str = ""
    like_count: int = 0
    comment_count: int = 0
    is_liked: bool = False
    tags: List[str] = []


# ── Comments ──────────────────────────────────────────
class CreateCommentRequest(BaseModel):
    content: str = Field(min_length=1, max_length=500)

class CommentResponse(BaseModel):
    comment_id: str
    post_id: str
    user_id: str
    content: str
    created_at: str
    username: str = ""
    display_name: str = ""
    avatar_url: str = ""


# ── Messages ─────────────────────────────────────────
class SendMessageRequest(BaseModel):
    receiver_id: str
    content: str = Field(min_length=1, max_length=1000)

class MessageResponse(BaseModel):
    message_id: str
    sender_id: str
    receiver_id: str
    content: str
    is_read: bool = False
    created_at: str
    sender_username: str = ""
    sender_display_name: str = ""
    sender_avatar_url: str = ""

class ConversationPreview(BaseModel):
    user_id: str
    username: str
    display_name: str
    avatar_url: str = ""
    last_message: str = ""
    last_message_at: str = ""
    unread_count: int = 0


# ── Notifications ────────────────────────────────────
class NotificationResponse(BaseModel):
    notification_id: str
    user_id: str
    actor_id: Optional[str] = None
    type: str
    content: str
    ref_id: Optional[str] = None
    is_read: bool = False
    created_at: str
    actor_username: str = ""
    actor_display_name: str = ""
    actor_avatar_url: str = ""


# ── Connections ───────────────────────────────────────
class ConnectionUserMini(BaseModel):
    user_id: str
    username: str
    display_name: str
    avatar_url: str = ""
    bio: str = ""

class ConnectionStatus(BaseModel):
    status: str  # none | pending_sent | pending_received | connected | self
    connection_id: Optional[str] = None

class ConnectionResponse(BaseModel):
    connection_id: str
    user: ConnectionUserMini
    status: str  # accepted | pending_sent | pending_received
    created_at: str
