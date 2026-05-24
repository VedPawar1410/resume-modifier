import shutil

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/health")
async def health():
    return {
        "status": "ok",
        "pdflatex_available": shutil.which("pdflatex") is not None,
    }
