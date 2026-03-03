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


class ChatMessage(BaseModel):
    role: str = Field(..., description="Role: 'user' or 'assistant'")
    content: str = Field(..., min_length=1, description="Message content")


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User's current message")
    history: list[ChatMessage] = Field(default=[], description="Previous conversation history")


class ChatResponse(BaseModel):
    response: str
    message: str  # alias for response for consistency


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


@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest):
    """
    Interactive AI Study Assistant chat endpoint.
    
    Provides a conversational AI tutor powered by Gemini that helps with:
    - Study assistance and academic guidance
    - Breaking down complex topics
    - Coding help and problem-solving
    - Encouragement and study tips
    
    Maintains conversation context through chat history.
    """
    try:
        response = await gemini_service.chat(body.message, body.history)
        return ChatResponse(response=response, message=response)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini error: {str(e)}")
