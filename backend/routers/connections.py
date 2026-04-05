from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from models.schemas import ConnectionResponse, ConnectionStatus
from database import supabase
from middleware.auth import get_current_user

router = APIRouter(prefix="/connections", tags=["Connections"])


# ── Helpers ───────────────────────────────────────────────────

def _get_connection(user_a: str, user_b: str) -> Optional[dict]:
    """Return the connection row between two users regardless of direction, or None."""
    try:
        result = supabase.table("connections").select("*").or_(
            f"and(requester_id.eq.{user_a},addressee_id.eq.{user_b}),"
            f"and(requester_id.eq.{user_b},addressee_id.eq.{user_a})"
        ).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"Warning: Could not query connections table: {str(e)}")
        return None


def _build_profile(user_data: dict) -> dict:
    """Build a minimal user dict for connection responses."""
    return {
        "user_id": user_data.get("user_id", ""),
        "username": user_data.get("username", "Unknown User"),
        "display_name": user_data.get("display_name", "Unknown User"),
        "avatar_url": user_data.get("avatar_url", ""),
        "bio": user_data.get("bio", ""),
    }


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/status/{user_id}", response_model=ConnectionStatus)
async def get_connection_status(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get connection status between current user and another user."""
    me = current_user["user_id"]
    if user_id == me:
        return ConnectionStatus(status="self")

    try:
        row = _get_connection(me, user_id)
    except Exception:
        return ConnectionStatus(status="none")

    if not row:
        return ConnectionStatus(status="none")

    if row["status"] == "accepted":
        return ConnectionStatus(status="connected", connection_id=row["connection_id"])

    if row["status"] == "pending":
        if row["requester_id"] == me:
            return ConnectionStatus(status="pending_sent", connection_id=row["connection_id"])
        else:
            return ConnectionStatus(status="pending_received", connection_id=row["connection_id"])

    # rejected — treat as none (requester can try again after removal)
    return ConnectionStatus(status="none")


@router.post("/request/{user_id}")
async def send_connection_request(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Send a connection request to another user."""
    me = current_user["user_id"]
    if user_id == me:
        raise HTTPException(status_code=400, detail="Cannot connect to yourself")

    existing = _get_connection(me, user_id)
    if existing:
        if existing["status"] == "accepted":
            raise HTTPException(status_code=400, detail="Already connected")
        if existing["status"] == "pending":
            raise HTTPException(status_code=400, detail="Connection request already pending")
        # If rejected, delete old row and allow re-request
        supabase.table("connections").delete().eq("connection_id", existing["connection_id"]).execute()

    try:
        supabase.table("connections").insert({
            "requester_id": me,
            "addressee_id": user_id,
            "status": "pending",
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "Connection request sent"}


@router.post("/accept/{user_id}")
async def accept_connection_request(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Accept a pending connection request from another user."""
    me = current_user["user_id"]
    row = _get_connection(me, user_id)

    if not row or row["status"] != "pending":
        raise HTTPException(status_code=404, detail="No pending connection request found")

    if row["addressee_id"] != me:
        raise HTTPException(status_code=403, detail="You can only accept requests sent to you")

    try:
        supabase.table("connections").update({"status": "accepted"}).eq(
            "connection_id", row["connection_id"]
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": "Connection accepted"}


@router.post("/reject/{user_id}")
async def reject_connection_request(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Reject a pending connection request."""
    me = current_user["user_id"]
    row = _get_connection(me, user_id)

    if not row or row["status"] != "pending":
        raise HTTPException(status_code=404, detail="No pending connection request found")

    if row["addressee_id"] != me:
        raise HTTPException(status_code=403, detail="You can only reject requests sent to you")

    supabase.table("connections").delete().eq("connection_id", row["connection_id"]).execute()
    return {"message": "Connection request rejected"}


@router.delete("/{user_id}")
async def remove_connection(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Remove an existing connection or cancel a sent request."""
    me = current_user["user_id"]
    row = _get_connection(me, user_id)

    if not row:
        raise HTTPException(status_code=404, detail="No connection found")

    # Only allow if current user is requester (cancel) or either party (remove accepted)
    if row["status"] == "pending" and row["requester_id"] != me:
        raise HTTPException(status_code=403, detail="Cannot cancel a request you didn't send")

    supabase.table("connections").delete().eq("connection_id", row["connection_id"]).execute()
    return {"message": "Connection removed"}


@router.get("", response_model=List[ConnectionResponse])
async def get_my_connections(current_user: dict = Depends(get_current_user)):
    """Get all accepted connections for the current user."""
    me = current_user["user_id"]
    try:
        result = supabase.table("connections").select("*").or_(
            f"requester_id.eq.{me},addressee_id.eq.{me}"
        ).eq("status", "accepted").execute()

        partner_ids = [
            row["addressee_id"] if row["requester_id"] == me else row["requester_id"]
            for row in result.data
        ]
        if not partner_ids:
            return []

        users = supabase.table("users").select("*").in_("user_id", partner_ids).execute()
        user_map = {u["user_id"]: u for u in users.data}

        connections = []
        for row in result.data:
            pid = row["addressee_id"] if row["requester_id"] == me else row["requester_id"]
            u = user_map.get(pid)
            if not u:
                continue
            connections.append(ConnectionResponse(
                connection_id=row["connection_id"],
                user=_build_profile(u),
                status="accepted",
                created_at=row["created_at"],
            ))
        return connections
    except Exception as e:
        print(f"Error fetching connections: {str(e)}")
        return []


@router.get("/requests/received", response_model=List[ConnectionResponse])
async def get_received_requests(current_user: dict = Depends(get_current_user)):
    """Get pending connection requests sent TO the current user."""
    me = current_user["user_id"]
    try:
        result = supabase.table("connections").select("*").eq(
            "addressee_id", me
        ).eq("status", "pending").order("created_at", desc=True).execute()

        if not result.data:
            return []

        requester_ids = [row["requester_id"] for row in result.data]
        users = supabase.table("users").select("*").in_("user_id", requester_ids).execute()
        user_map = {u["user_id"]: u for u in users.data}

        return [
            ConnectionResponse(
                connection_id=row["connection_id"],
                user=_build_profile(user_map[row["requester_id"]]),
                status="pending_received",
                created_at=row["created_at"],
            )
            for row in result.data if row["requester_id"] in user_map
        ]
    except Exception as e:
        print(f"Error fetching received requests: {str(e)}")
        return []


@router.get("/requests/sent", response_model=List[ConnectionResponse])
async def get_sent_requests(current_user: dict = Depends(get_current_user)):
    """Get pending connection requests sent BY the current user."""
    me = current_user["user_id"]
    try:
        result = supabase.table("connections").select("*").eq(
            "requester_id", me
        ).eq("status", "pending").order("created_at", desc=True).execute()

        if not result.data:
            return []

        addressee_ids = [row["addressee_id"] for row in result.data]
        users = supabase.table("users").select("*").in_("user_id", addressee_ids).execute()
        user_map = {u["user_id"]: u for u in users.data}

        return [
            ConnectionResponse(
                connection_id=row["connection_id"],
                user=_build_profile(user_map[row["addressee_id"]]),
                status="pending_sent",
                created_at=row["created_at"],
            )
            for row in result.data if row["addressee_id"] in user_map
        ]
    except Exception as e:
        print(f"Error fetching sent requests: {str(e)}")
        return []
