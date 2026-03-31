from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, posts, users, social

app = FastAPI(
    title="Social Media Mini Platform API",
    description="A full-stack social media platform built with FastAPI + Supabase",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(posts.router)
app.include_router(users.router)
app.include_router(social.router)


@app.get("/")
async def root():
    return {
        "message": "Social Media Mini Platform API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
