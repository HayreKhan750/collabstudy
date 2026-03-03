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

    # Gemini 1.5 models were retired in late 2025 - now using Gemini 2.5
    # See: https://ai.google.dev/gemini-api/docs/models/gemini
    CHAT_MODEL = "gemini-2.5-flash"  # Gemini 2.5 Flash (latest stable model)
    EMBED_MODEL = "models/text-embedding-004"

    def __init__(self) -> None:
        genai.configure(api_key=_get_api_key())
        self._model = genai.GenerativeModel(self.CHAT_MODEL)

    async def summarise(self, text: str) -> str:
        """Return a summary of *text*, preserving any structure in the prompt."""
        # The NestJS layer already builds a fully-structured prompt (Overview,
        # Key Topics, Participants, Action Items) — pass it through unchanged.
        # google-generativeai is sync; run in thread pool to avoid blocking.
        loop = asyncio.get_event_loop()
        try:
            response = await asyncio.wait_for(
                loop.run_in_executor(
                    None, partial(self._model.generate_content, text)
                ),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            raise RuntimeError("Gemini API call timed out after 30 seconds")

        # Gemini can return a response with no text (e.g. safety filter blocked it)
        result = getattr(response, "text", None)
        if not result or not result.strip():
            raise RuntimeError(
                "Gemini returned an empty response — the content may have been blocked by safety filters"
            )
        return result.strip()

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

    async def chat_stream(self, message: str, history: list[dict]):
        """
        Interactive chat with streaming response.
        
        Args:
            message: The user's current message
            history: List of previous messages with 'role' and 'content' keys
        
        Yields:
            Chunks of the AI response as they arrive
        """
        # System prompt that defines the AI tutor's persona
        system_instruction = """You are the Collabstudy AI Tutor. You are an encouraging, highly knowledgeable, and concise study assistant. 

Your role is to:
- Help students understand complex topics with clear, easy-to-understand explanations
- Break down difficult problems into manageable steps
- Provide coding or academic guidance across various subjects
- Offer encouragement and positive reinforcement
- Keep responses concise but comprehensive
- Use Markdown formatting for better readability (code blocks, lists, headers, etc.)

Guidelines:
- Be friendly and supportive in your tone
- Use examples and analogies when helpful
- If a topic is complex, break it into smaller concepts
- For code-related questions, provide working examples with explanations
- If you don't know something, admit it honestly and suggest resources
- Encourage critical thinking by asking guiding questions when appropriate

Format your responses with clear Markdown:
- Use **bold** for important terms
- Use `code` for inline code
- Use ```language for code blocks
- Use bullet points or numbered lists for clarity
- Use headers (##) to organize longer responses"""

        # Create a chat session with system instruction
        loop = asyncio.get_event_loop()
        
        # Build conversation history in Gemini's format
        conversation = []
        for msg in history:
            conversation.append({
                "role": "user" if msg["role"] == "user" else "model",
                "parts": [msg["content"]]
            })
        
        # Create model with system instruction
        chat_model = genai.GenerativeModel(
            self.CHAT_MODEL,
            system_instruction=system_instruction
        )
        
        try:
            # Generate streaming response
            chat_session = chat_model.start_chat(history=conversation)
            response = await loop.run_in_executor(
                None, partial(chat_session.send_message, message, stream=True)
            )
            
            # Stream chunks as they arrive
            for chunk in response:
                if hasattr(chunk, 'text') and chunk.text:
                    yield chunk.text
                    
        except asyncio.TimeoutError:
            raise RuntimeError("Gemini API call timed out after 35 seconds")
        except Exception as e:
            raise RuntimeError(f"Gemini streaming error: {str(e)}")

    async def chat(self, message: str, history: list[dict]) -> str:
        """
        Interactive chat with the Collabstudy AI Study Tutor.
        
        Args:
            message: The user's current message
            history: List of previous messages with 'role' and 'content' keys
        
        Returns:
            The AI tutor's response as a string
        """
        # System prompt that defines the AI tutor's persona
        system_instruction = """You are the Collabstudy AI Tutor. You are an encouraging, highly knowledgeable, and concise study assistant. 

Your role is to:
- Help students understand complex topics with clear, easy-to-understand explanations
- Break down difficult problems into manageable steps
- Provide coding or academic guidance across various subjects
- Offer encouragement and positive reinforcement
- Keep responses concise but comprehensive
- Use Markdown formatting for better readability (code blocks, lists, headers, etc.)

Guidelines:
- Be friendly and supportive in your tone
- Use examples and analogies when helpful
- If a topic is complex, break it into smaller concepts
- For code-related questions, provide working examples with explanations
- If you don't know something, admit it honestly and suggest resources
- Encourage critical thinking by asking guiding questions when appropriate

Format your responses with clear Markdown:
- Use **bold** for important terms
- Use `code` for inline code
- Use ```language for code blocks
- Use bullet points or numbered lists for clarity
- Use headers (##) to organize longer responses"""

        # Create a chat session with system instruction
        loop = asyncio.get_event_loop()
        
        # Build conversation history in Gemini's format
        conversation = []
        for msg in history:
            conversation.append({
                "role": "user" if msg["role"] == "user" else "model",
                "parts": [msg["content"]]
            })
        
        # Add current message
        conversation.append({
            "role": "user",
            "parts": [message]
        })
        
        # Create model with system instruction
        chat_model = genai.GenerativeModel(
            self.CHAT_MODEL,
            system_instruction=system_instruction
        )
        
        try:
            # Generate response with conversation history
            chat_session = chat_model.start_chat(history=conversation[:-1])  # Exclude current message
            response = await asyncio.wait_for(
                loop.run_in_executor(
                    None, partial(chat_session.send_message, message)
                ),
                timeout=35.0,
            )
        except asyncio.TimeoutError:
            raise RuntimeError("Gemini API call timed out after 35 seconds")
        
        # Extract text from response
        result = getattr(response, "text", None)
        if not result or not result.strip():
            raise RuntimeError(
                "Gemini returned an empty response — the content may have been blocked by safety filters"
            )
        return result.strip()


# Module-level singleton — imported by routers
gemini_service = GeminiService()
