import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api import work_items

from app.api.auth import router as auth_router
from app.api.teams import router as teams_router

app = FastAPI(
    title="OpsFlow API",
    description="Internal operations management platform",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173"
    ).split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(teams_router)
app.include_router(work_items.router)


@app.get("/")
def root():
    index_file = Path(__file__).parent / "static" / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)
    return {
        "message": "Welcome to OpsFlow API",
        "version": "0.2.0",
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "opsflow-api",
    }


static_dir = Path(__file__).parent / "static"
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
