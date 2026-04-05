import time
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from database import supabase
from middleware.auth import get_current_user

router = APIRouter(prefix="/uploads", tags=["Uploads"])

ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/webm", "video/quicktime",
}
MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post("/media")
async def upload_media(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload a media file (image or video) to Supabase Storage.
    Uses the service role client — always bypasses RLS/session issues.
    Returns: { url, media_type }
    """
    # Validate content type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Allowed: images and videos."
        )

    content = await file.read()

    # Validate size
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    # Build storage path: {user_id}/{timestamp}.{ext}
    ext = (file.filename or "upload").rsplit(".", 1)[-1].lower()
    path = f"{current_user['user_id']}/{int(time.time())}.{ext}"

    try:
        supabase.storage.from_("post-media").upload(
            path,
            content,
            {"content-type": file.content_type, "x-upsert": "false"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    public_url = supabase.storage.from_("post-media").get_public_url(path)
    media_type = "video" if file.content_type.startswith("video") else "image"

    return {"url": public_url, "media_type": media_type, "path": path}
