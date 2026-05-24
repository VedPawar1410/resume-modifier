import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import health, modify

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="Resume Modifier API",
    description="AI-powered resume tailoring and refinement tool",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:4173",  # Vite preview
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(modify.router)


@app.get("/")
async def root():
    return {"message": "Resume Modifier API is running. See /docs for API reference."}
