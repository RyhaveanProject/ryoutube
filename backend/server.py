from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, Request, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os
import time
import logging
import asyncio
import random
import uuid
import bcrypt
import jwt
import yt_dlp
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ.get("JWT_SECRET", "ryhavean-youtube-secret-change-me")
JWT_ALGO = "HS256"
JWT_EXPIRE_DAYS = 30

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "ravenhadjiyevh@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "ItWS*]iD)%$mSGa!")

app = FastAPI(title="Ryhavean YouTube")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("ryhavean-yt")

# ---------------- yt-dlp config ----------------
_USER_AGENTS = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]


def _make_search_opts():
    return {
        "quiet": True, "no_warnings": True, "skip_download": True,
        "extract_flat": True, "default_search": "ytsearch",
        "noplaylist": True, "socket_timeout": 15,
        "user_agent": random.choice(_USER_AGENTS),
        "extractor_args": {"youtube": {"player_client": ["ios", "web"]}},
    }


def _make_stream_opts():
    return {
        "quiet": True, "no_warnings": True, "skip_download": True,
        # Preference order (each "/" separated alternative is tried in order):
        #   1. Combined progressive mp4  (works in <video> on any browser)
        #   2. Any combined progressive (audio+video in one stream)
        #   3. HLS m3u8 (live streams + VOD fallback — handled via hls.js on frontend)
        #   4. Best of anything (last resort)
        "format": (
            "best[protocol^=https][ext=mp4][acodec!=none][vcodec!=none]"
            "/best[protocol^=https][acodec!=none][vcodec!=none]"
            "/best[protocol*=m3u8][acodec!=none][vcodec!=none]"
            "/best[ext=mp4]/best"
        ),
        "noplaylist": True, "socket_timeout": 20,
        "user_agent": random.choice(_USER_AGENTS),
        # 'mweb' & 'tv' clients more reliably yield progressive MP4 URLs for
        # regular (VOD) videos. 'ios' is kept as a fallback (HLS for live).
        "extractor_args": {
            "youtube": {"player_client": ["mweb", "tv", "android", "ios", "web"]}
        },
    }


def _make_video_info_opts():
    return {
        "quiet": True, "no_warnings": True, "skip_download": True,
        "noplaylist": True, "socket_timeout": 15,
        "user_agent": random.choice(_USER_AGENTS),
        "extractor_args": {"youtube": {"player_client": ["ios", "web"]}},
    }


# ---------------- TTL cache ----------------
_CACHE: dict = {}
_CACHE_TTL_FEATURED = 60 * 60 * 6
_CACHE_TTL_SEARCH = 60 * 30
_CACHE_TTL_STREAM = 60 * 60 * 4
_CACHE_TTL_INFO = 60 * 60 * 2


def cache_get(key: str):
    v = _CACHE.get(key)
    if not v:
        return None
    exp, data = v
    if time.time() > exp:
        _CACHE.pop(key, None)
        return None
    return data


def cache_set(key: str, data, ttl: int):
    _CACHE[key] = (time.time() + ttl, data)


# ---------------- yt-dlp helpers ----------------
def _pick_thumb(thumbs, vid):
    if thumbs:
        for t in reversed(thumbs):
            u = t.get("url") or ""
            if u and "vi_webp" not in u:
                return u
    return f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"


def _search_sync(query: str, limit: int = 24):
    opts = _make_search_opts()
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
    entries = info.get("entries", []) if info else []
    out = []
    for e in entries:
        if not e:
            continue
        vid = e.get("id") or e.get("video_id")
        if not vid:
            continue
        out.append({
            "id": vid,
            "title": e.get("title") or "Untitled",
            "channel": e.get("uploader") or e.get("channel") or "Unknown",
            "channel_id": e.get("channel_id") or e.get("uploader_id") or "",
            "duration": int(e.get("duration") or 0),
            "view_count": int(e.get("view_count") or 0),
            "thumbnail": _pick_thumb(e.get("thumbnails") or [], vid),
            "url": f"https://www.youtube.com/watch?v={vid}",
        })
    return out


def _stream_sync(video_id: str):
    opts = _make_stream_opts()
    url = f"https://www.youtube.com/watch?v={video_id}"
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    if not info:
        return None

    is_live = bool(
        info.get("is_live")
        or info.get("live_status") in ("is_live", "is_upcoming")
    )

    stream_url = info.get("url")
    formats = info.get("formats") or []

    # Prefer combined progressive mp4 (audio + video in a single stream)
    if not stream_url:
        progressive_mp4 = [
            f for f in formats
            if f.get("vcodec") and f["vcodec"] != "none"
            and f.get("acodec") and f["acodec"] != "none"
            and f.get("url")
            and (f.get("ext") == "mp4" or "mp4" in (f.get("container") or ""))
        ]
        progressive_mp4.sort(key=lambda f: f.get("height") or 0, reverse=True)
        if progressive_mp4:
            stream_url = progressive_mp4[0]["url"]

    # Then any combined progressive
    if not stream_url:
        any_combined = [
            f for f in formats
            if f.get("vcodec") and f["vcodec"] != "none"
            and f.get("acodec") and f["acodec"] != "none"
            and f.get("url")
        ]
        any_combined.sort(key=lambda f: f.get("height") or 0, reverse=True)
        if any_combined:
            stream_url = any_combined[0]["url"]

    # Then HLS manifest (live streams + VOD fallback — frontend uses hls.js)
    if not stream_url:
        for f in formats:
            proto = (f.get("protocol") or "").lower()
            if "m3u8" in proto and f.get("url"):
                stream_url = f["url"]
                break

    if not stream_url:
        stream_url = info.get("manifest_url") or info.get("hls_url")

    is_hls = bool(stream_url and ".m3u8" in stream_url)

    return {
        "stream_url": stream_url,
        "is_live": is_live,
        "is_hls": is_hls,
        "title": info.get("title"),
        "channel": info.get("uploader") or info.get("channel"),
        "channel_id": info.get("channel_id"),
        "duration": int(info.get("duration") or 0),
        "thumbnail": _pick_thumb(info.get("thumbnails") or [], info.get("id") or video_id),
        "description": info.get("description") or "",
        "view_count": int(info.get("view_count") or 0),
        "like_count": int(info.get("like_count") or 0),
        "upload_date": info.get("upload_date") or "",
    }


async def yt_search(query, limit=24, ttl=_CACHE_TTL_SEARCH):
    key = f"search::{query}::{limit}"
    hit = cache_get(key)
    if hit is not None:
        return hit
    data = await asyncio.to_thread(_search_sync, query, limit)
    if data:
        cache_set(key, data, ttl)
    return data


_STREAM_LOCKS: dict = {}


def _get_stream_lock(video_id: str) -> asyncio.Lock:
    lock = _STREAM_LOCKS.get(video_id)
    if lock is None:
        lock = asyncio.Lock()
        _STREAM_LOCKS[video_id] = lock
    return lock


async def resolve_stream(video_id: str, force: bool = False):
    key = f"streamdata::{video_id}"
    if not force:
        hit = cache_get(key)
        if hit is not None:
            return hit
    lock = _get_stream_lock(video_id)
    async with lock:
        if not force:
            hit = cache_get(key)
            if hit is not None:
                return hit
        try:
            data = await asyncio.to_thread(_stream_sync, video_id)
        except Exception:
            logger.exception("yt-dlp resolve failed for %s", video_id)
            data = None
        if data and data.get("stream_url"):
            cache_set(key, data, _CACHE_TTL_STREAM)
        return data


# ---------------- Auth helpers ----------------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def make_token(user_id: str, device_id: str, role: str) -> str:
    payload = {
        "uid": user_id,
        "did": device_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    x_device_id: Optional[str] = Header(None),
):
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except Exception:
        raise HTTPException(401, "Invalid token")

    user = await db.users.find_one({"id": payload["uid"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    if not user.get("active", True):
        raise HTTPException(403, "Account disabled")

    # Device binding (admin can use any device)
    if user.get("role") != "admin":
        bound = user.get("device_id")
        token_did = payload.get("did")
        # Token's device_id must match user's currently bound device
        if bound and token_did and bound != token_did:
            raise HTTPException(409, "DEVICE_MISMATCH")
        if x_device_id and bound and x_device_id != bound:
            raise HTTPException(409, "DEVICE_MISMATCH")

    return user


async def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return user


# ---------------- Models ----------------
class LoginIn(BaseModel):
    email: EmailStr
    password: str
    device_id: str


class CreateUserIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = ""


class UpdateUserIn(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    active: Optional[bool] = None
    reset_device: Optional[bool] = None


class VideoRef(BaseModel):
    id: str
    title: str
    channel: str = ""
    duration: int = 0
    thumbnail: str = ""
    view_count: int = 0


class HistoryIn(BaseModel):
    video: VideoRef
    progress: float = 0.0  # seconds watched


class TrendBoostIn(BaseModel):
    video_id: str
    boost: int = 100  # added to engagement score


# ---------------- Auth routes ----------------
@api.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password")
    if not user.get("active", True):
        raise HTTPException(403, "Account disabled by admin")

    role = user.get("role", "user")

    # Device binding for non-admins
    if role != "admin":
        bound = user.get("device_id")
        if bound and bound != body.device_id:
            raise HTTPException(409, "DEVICE_MISMATCH")
        if not bound:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"device_id": body.device_id,
                          "device_bound_at": datetime.now(timezone.utc).isoformat()}},
            )

    token = make_token(user["id"], body.device_id, role)
    return {
        "token": token,
        "user": {
            "id": user["id"], "email": user["email"],
            "name": user.get("name", ""), "role": role,
        },
    }


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return {
        "id": user["id"], "email": user["email"],
        "name": user.get("name", ""), "role": user.get("role", "user"),
    }


@api.post("/auth/logout")
async def logout(user=Depends(get_current_user)):
    # Release device binding so user can login from another device next time
    if user.get("role") != "admin":
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"device_id": None}},
        )
    return {"ok": True}


# ---------------- Admin routes ----------------
@api.get("/admin/users")
async def admin_list_users(_=Depends(require_admin)):
    items = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return {"users": items}


@api.post("/admin/users")
async def admin_create_user(body: CreateUserIn, _=Depends(require_admin)):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name or "",
        "password_hash": hash_password(body.password),
        "role": "user",
        "active": True,
        "device_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    doc.pop("password_hash", None)
    return {"user": doc}


@api.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, body: UpdateUserIn, _=Depends(require_admin)):
    update = {}
    if body.name is not None:
        update["name"] = body.name
    if body.password:
        update["password_hash"] = hash_password(body.password)
    if body.active is not None:
        update["active"] = body.active
    if body.reset_device:
        update["device_id"] = None
    if not update:
        return {"ok": True}
    res = await db.users.update_one({"id": user_id, "role": {"$ne": "admin"}}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    return {"ok": True}


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, _=Depends(require_admin)):
    res = await db.users.delete_one({"id": user_id, "role": {"$ne": "admin"}})
    if res.deleted_count == 0:
        raise HTTPException(404, "User not found")
    await db.history.delete_many({"user_id": user_id})
    await db.likes.delete_many({"user_id": user_id})
    await db.watch_later.delete_many({"user_id": user_id})
    return {"ok": True}


@api.post("/admin/trends/boost")
async def admin_boost_trend(body: TrendBoostIn, _=Depends(require_admin)):
    await db.trend_boosts.update_one(
        {"video_id": body.video_id},
        {"$inc": {"boost": body.boost},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@api.get("/admin/trends/boosted")
async def admin_list_boosted(_=Depends(require_admin)):
    items = await db.trend_boosts.find({}, {"_id": 0}).sort("boost", -1).to_list(200)
    return {"boosts": items}


# ---------------- Public-ish app routes (auth required) ----------------
@api.get("/")
async def root():
    return {"app": "Ryhavean YouTube", "status": "ok"}


@api.get("/search")
async def search(q: str = Query(..., min_length=1), limit: int = 24, user=Depends(get_current_user)):
    try:
        results = await yt_search(q, limit=min(max(limit, 1), 30))
        return {"query": q, "count": len(results), "results": results}
    except Exception as e:
        logger.exception("search failed")
        raise HTTPException(502, f"Search failed: {e}")


@api.get("/suggest")
async def suggest(q: str = Query(..., min_length=1), user=Depends(get_current_user)):
    """Lightweight autocomplete via YouTube's public suggestion endpoint."""
    url = "https://suggestqueries.google.com/complete/search"
    params = {"client": "youtube", "ds": "yt", "q": q, "hl": "en"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as cx:
            r = await cx.get(url, params=params, headers={"User-Agent": _USER_AGENTS[0]})
        text = r.text
        # Response is JSONP-like: window.google.ac.h([...])
        start = text.find("[")
        end = text.rfind("]")
        import json as _json
        if start >= 0 and end > start:
            arr = _json.loads(text[start:end + 1])
            suggestions = [s[0] for s in arr[1] if isinstance(s, list)]
            return {"suggestions": suggestions[:10]}
    except Exception:
        pass
    return {"suggestions": []}


@api.get("/trending-keywords")
async def trending_keywords(_=Depends(get_current_user)):
    return {"keywords": [
        "Music", "Gaming", "News", "Sports", "Movies", "Live",
        "Lo-fi", "Podcast", "Trailers", "Shorts", "Tech", "Comedy",
    ]}


@api.get("/video/{video_id}")
async def video_meta(video_id: str, user=Depends(get_current_user)):
    """Returns full video metadata (without resolving stream URL — heavier)."""
    key = f"info::{video_id}"
    hit = cache_get(key)
    if hit:
        return hit
    data = await resolve_stream(video_id)
    if not data:
        raise HTTPException(404, "Video not found")
    out = {
        "id": video_id,
        "title": data.get("title"),
        "channel": data.get("channel"),
        "channel_id": data.get("channel_id"),
        "duration": data.get("duration"),
        "thumbnail": data.get("thumbnail"),
        "description": data.get("description"),
        "view_count": data.get("view_count"),
        "like_count": data.get("like_count"),
        "upload_date": data.get("upload_date"),
    }
    cache_set(key, out, _CACHE_TTL_INFO)
    return out


@api.get("/stream/{video_id}")
async def stream_meta(video_id: str, request: Request, proxy: int = 0, user=Depends(get_current_user)):
    """
    Returns playable stream URL.
    - default: direct googlevideo URL (each device's own IP, saves backend bandwidth)
    - ?proxy=1: routed through /api/proxy-stream/{id} (server IP)
                Note: ignored for HLS / live streams (manifest playlists can't be
                trivially proxied — segments are fetched directly by the player).
    """
    data = await resolve_stream(video_id)
    if not data or not data.get("stream_url"):
        raise HTTPException(404, "Stream not found")

    is_hls = bool(data.get("is_hls"))
    is_live = bool(data.get("is_live"))

    if proxy and not is_hls:
        base = str(request.base_url).rstrip("/")
        out_url = f"{base}/api/proxy-stream/{video_id}"
    else:
        out_url = data["stream_url"]

    # increment play count
    try:
        await db.play_counts.update_one(
            {"id": video_id},
            {"$inc": {"plays": 1},
             "$set": {"title": data.get("title") or "",
                      "channel": data.get("channel") or "",
                      "thumbnail": data.get("thumbnail") or "",
                      "duration": data.get("duration") or 0,
                      "last_played": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    except Exception:
        pass

    return {
        "video_id": video_id,
        "title": data.get("title"),
        "channel": data.get("channel"),
        "channel_id": data.get("channel_id"),
        "duration": data.get("duration"),
        "thumbnail": data.get("thumbnail"),
        "description": data.get("description"),
        "view_count": data.get("view_count"),
        "stream_url": out_url,
        "is_live": is_live,
        "is_hls": is_hls,
        "direct": (not bool(proxy)) or is_hls,
    }


# ---------------- Proxy stream (fallback) ----------------
_HTTP_TIMEOUT = httpx.Timeout(connect=10.0, read=None, write=30.0, pool=15.0)


@api.get("/proxy-stream/{video_id}")
async def proxy_stream(video_id: str, request: Request):
    range_header = request.headers.get("range")
    data = await resolve_stream(video_id)
    if not data or not data.get("stream_url"):
        raise HTTPException(404, "Stream not available")

    headers = {"User-Agent": _USER_AGENTS[0], "Accept": "*/*"}
    if range_header:
        headers["Range"] = range_header

    upstream = httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=True)
    req = upstream.build_request("GET", data["stream_url"], headers=headers)
    try:
        resp = await upstream.send(req, stream=True)
    except Exception:
        await upstream.aclose()
        raise HTTPException(502, "Upstream error")

    if resp.status_code in (403, 410):
        await resp.aclose()
        await upstream.aclose()
        data = await resolve_stream(video_id, force=True)
        if not data or not data.get("stream_url"):
            raise HTTPException(404, "Stream re-resolve failed")
        upstream = httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=True)
        req = upstream.build_request("GET", data["stream_url"], headers=headers)
        resp = await upstream.send(req, stream=True)

    async def _body():
        try:
            async for chunk in resp.aiter_raw():
                yield chunk
        finally:
            try:
                await resp.aclose()
            except Exception:
                pass
            try:
                await upstream.aclose()
            except Exception:
                pass

    pass_headers = {}
    for h in ("content-type", "content-length", "content-range",
              "accept-ranges", "etag", "last-modified"):
        v = resp.headers.get(h)
        if v:
            pass_headers[h.title()] = v
    pass_headers.setdefault("Accept-Ranges", "bytes")
    pass_headers.setdefault("Cache-Control", "no-store")

    return StreamingResponse(
        _body(),
        status_code=resp.status_code,
        headers=pass_headers,
        media_type=pass_headers.get("Content-Type", "video/mp4"),
    )


# ---------------- Recommendations ----------------
@api.get("/recommendations")
async def recommendations(video_id: Optional[str] = None, user=Depends(get_current_user)):
    """
    Algo:
      1. If video_id provided → search "<title> related" using its title
      2. Else use user's history to bias recommendations
      3. Mix in trending boosted by admin
    """
    queries: List[str] = []
    seed_title = None

    if video_id:
        info = await db.play_counts.find_one({"id": video_id}, {"_id": 0, "title": 1, "channel": 1})
        if info:
            seed_title = info.get("title")
            if info.get("channel"):
                queries.append(info["channel"])

    history = await db.history.find({"user_id": user["id"]}, {"_id": 0}).sort("played_at", -1).to_list(5)
    for h in history:
        if h.get("channel"):
            queries.append(h["channel"])

    if not queries:
        queries = ["trending", "music", "news"]

    if seed_title:
        queries.insert(0, seed_title)

    seen = set()
    final: List[dict] = []
    for q in queries[:3]:
        try:
            res = await yt_search(q, limit=12)
            for r in res:
                if r["id"] == video_id or r["id"] in seen:
                    continue
                seen.add(r["id"])
                final.append(r)
        except Exception:
            continue

    # Apply admin boosts: pull boosted videos to front
    boosted = await db.trend_boosts.find({}, {"_id": 0}).sort("boost", -1).to_list(20)
    if boosted:
        boost_ids = {b["video_id"] for b in boosted}
        boosted_items = [v for v in final if v["id"] in boost_ids]
        rest = [v for v in final if v["id"] not in boost_ids]
        final = boosted_items + rest

    return {"results": final[:30]}


# ---------------- Home feed ----------------
HOME_QUERIES = {
    "trending": "trending videos today",
    "music": "popular music videos",
    "gaming": "top gaming videos",
    "news": "world news today",
    "movies": "movie trailers 2025",
    "live": "live streams now",
}


@api.get("/home")
async def home_feed(user=Depends(get_current_user)):
    sections = {}

    async def _fetch(name, q):
        try:
            sections[name] = await yt_search(q, limit=12, ttl=_CACHE_TTL_FEATURED)
        except Exception:
            sections[name] = []

    await asyncio.gather(*[_fetch(n, q) for n, q in HOME_QUERIES.items()])

    # Continue watching
    cw = await db.history.find(
        {"user_id": user["id"], "progress": {"$gt": 5}},
        {"_id": 0},
    ).sort("played_at", -1).to_list(10)

    return {
        "sections": sections,
        "continue_watching": cw,
    }


@api.get("/categories")
async def categories(_=Depends(get_current_user)):
    return {"categories": list(HOME_QUERIES.keys())}


@api.get("/category/{name}")
async def category_feed(name: str, user=Depends(get_current_user)):
    q = HOME_QUERIES.get(name, name)
    res = await yt_search(q, limit=24, ttl=_CACHE_TTL_FEATURED)
    return {"name": name, "results": res}


# ---------------- History / Continue watching ----------------
@api.post("/history")
async def add_history(body: HistoryIn, user=Depends(get_current_user)):
    doc = {
        "user_id": user["id"],
        "video_id": body.video.id,
        "title": body.video.title,
        "channel": body.video.channel,
        "duration": body.video.duration,
        "thumbnail": body.video.thumbnail,
        "view_count": body.video.view_count,
        "progress": body.progress,
        "played_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.history.update_one(
        {"user_id": user["id"], "video_id": body.video.id},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


@api.get("/history")
async def list_history(user=Depends(get_current_user), limit: int = 50):
    items = await db.history.find({"user_id": user["id"]}, {"_id": 0}).sort("played_at", -1).to_list(limit)
    return {"history": items}


@api.delete("/history/{video_id}")
async def delete_history_item(video_id: str, user=Depends(get_current_user)):
    await db.history.delete_one({"user_id": user["id"], "video_id": video_id})
    return {"ok": True}


@api.delete("/history")
async def clear_history(user=Depends(get_current_user)):
    await db.history.delete_many({"user_id": user["id"]})
    return {"ok": True}


# ---------------- Likes / favorites ----------------
@api.post("/likes")
async def add_like(body: VideoRef, user=Depends(get_current_user)):
    doc = {
        "user_id": user["id"],
        "video_id": body.id,
        "title": body.title,
        "channel": body.channel,
        "duration": body.duration,
        "thumbnail": body.thumbnail,
        "view_count": body.view_count,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.likes.update_one(
        {"user_id": user["id"], "video_id": body.id},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


@api.delete("/likes/{video_id}")
async def remove_like(video_id: str, user=Depends(get_current_user)):
    await db.likes.delete_one({"user_id": user["id"], "video_id": video_id})
    return {"ok": True}


@api.get("/likes")
async def list_likes(user=Depends(get_current_user)):
    items = await db.likes.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = [i["video_id"] for i in items]
    return {"likes": items, "ids": ids}


# ---------------- Watch later ----------------
@api.post("/watch-later")
async def add_watch_later(body: VideoRef, user=Depends(get_current_user)):
    doc = {
        "user_id": user["id"],
        "video_id": body.id,
        "title": body.title,
        "channel": body.channel,
        "duration": body.duration,
        "thumbnail": body.thumbnail,
        "view_count": body.view_count,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.watch_later.update_one(
        {"user_id": user["id"], "video_id": body.id},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


@api.delete("/watch-later/{video_id}")
async def remove_watch_later(video_id: str, user=Depends(get_current_user)):
    await db.watch_later.delete_one({"user_id": user["id"], "video_id": video_id})
    return {"ok": True}


@api.get("/watch-later")
async def list_watch_later(user=Depends(get_current_user)):
    items = await db.watch_later.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"items": items}


# ---------------- Bootstrap admin on startup ----------------
async def _ensure_admin():
    existing = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    if existing:
        # Make sure password matches the configured one
        if not verify_password(ADMIN_PASSWORD, existing.get("password_hash", "")):
            await db.users.update_one(
                {"id": existing["id"]},
                {"$set": {"password_hash": hash_password(ADMIN_PASSWORD), "role": "admin", "active": True}},
            )
        return
    doc = {
        "id": str(uuid.uuid4()),
        "email": ADMIN_EMAIL.lower(),
        "name": "Admin",
        "password_hash": hash_password(ADMIN_PASSWORD),
        "role": "admin",
        "active": True,
        "device_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    logger.info("Admin user seeded: %s", ADMIN_EMAIL)


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    await _ensure_admin()


@app.on_event("shutdown")
async def _shutdown():
    client.close()
