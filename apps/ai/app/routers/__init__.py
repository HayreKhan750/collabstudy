"""
API Routers
-----------
Exposes AI capabilities as REST endpoints:
  POST /summarise  — summarise a block of text with Gemini
  POST /embed      — generate a text embedding vector with Gemini
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import gemini_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class SummariseRequest(BaseModel):
    text: str = Field(..., min_length=10, description="Text to summarise")


class SummariseResponse(BaseModel):
    summary: str


class EmbedRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to embed")


class EmbedResponse(BaseModel):
    embedding: list[float]
    dimensions: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/summarise", response_model=SummariseResponse)
async def summarise(body: SummariseRequest):
    """Summarise a conversation or block of text using Gemini 1.5 Flash."""
    try:
        summary = await gemini_service.summarise(body.text)
        return SummariseResponse(summary=summary)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini error: {str(e)}")


@router.post("/embed", response_model=EmbedResponse)
async def embed(body: EmbedRequest):
    """Generate a text embedding vector using Gemini text-embedding-004."""
    try:
        embedding = await gemini_service.embed(body.text)
        return EmbedResponse(embedding=embedding, dimensions=len(embedding))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini error: {str(e)}")
