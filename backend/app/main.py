import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.command import router as command_router
from app.routes.cluster import router as cluster_router
from app.routes.settings import router as settings_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="kubectl-ai backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(command_router, prefix="/api/command")
app.include_router(cluster_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
