import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import router

app = FastAPI(
    title="CollabStudy AI Service",
    version="0.1.0",
    description="Gemini-powered summarisation and embedding endpoints",
)

# Allow the NestJS API, web app, and local dev to call this service
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:4000,https://collabstudyweb-production.up.railway.app",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register AI routes (/summarise, /embed)
app.include_router(router)


@app.get("/")
async def root():
    return {"message": "CollabStudy AI Service", "status": "running", "version": "0.1.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ai"}
