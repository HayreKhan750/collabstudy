"""
Business Logic Services
-----------------------
GeminiService wraps the Google Generative AI SDK to provide:
  - summarise(text)  → concise bullet-point summary via gemini-1.5-flash
  - embed(text)      → 768-dim embedding via text-embedding-004
"""

import os
import asyncio
from functools import partial

import google.generativeai as genai


def _get_api_key() -> str:
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        raise RuntimeError(
            "GEMINI_API_KEY environment variable is not set. "
            "Get a free key at https://aistudio.google.com/app/apikey"
        )
    return key


class GeminiService:
    """Singleton-style service; instantiate once and reuse."""

    CHAT_MODEL = "gemini-1.5-flash"
    EMBED_MODEL = "models/text-embedding-004"

    def __init__(self) -> None:
        genai.configure(api_key=_get_api_key())
        self._model = genai.GenerativeModel(self.CHAT_MODEL)

    async def summarise(self, text: str) -> str:
        """Return a concise bullet-point summary of *text*."""
        prompt = (
            "Summarise the following conversation in clear, concise bullet points. "
            "Focus on key decisions, action items, and important information. "
            "Use markdown bullet points (- ).\n\n"
            f"{text}"
        )
        # google-generativeai is sync; run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, partial(self._model.generate_content, prompt)
        )
        return response.text.strip()

    async def embed(self, text: str) -> list[float]:
        """Return a text embedding vector for *text*."""
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            partial(
                genai.embed_content,
                model=self.EMBED_MODEL,
                content=text,
                task_type="retrieval_document",
            ),
        )
        return result["embedding"]


# Module-level singleton — imported by routers
gemini_service = GeminiService()
