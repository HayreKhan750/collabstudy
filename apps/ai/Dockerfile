# =============================================================================
# CollabStudy AI Service — Production Dockerfile
# =============================================================================
# Lightweight single-stage build for the FastAPI/Uvicorn Python service.
# =============================================================================

FROM python:3.12-slim

# Install OS-level dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security
RUN groupadd -g 1001 aiuser && useradd -u 1001 -g aiuser -s /bin/sh -m aiuser

WORKDIR /app

# Copy and install Python dependencies first (layer caching)
COPY --chown=aiuser:aiuser requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY --chown=aiuser:aiuser . .

# Switch to non-root user
USER aiuser

# Expose the AI service port
EXPOSE 8000

# Start Uvicorn — PORT env var is set by Railway; default to 8000 locally
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
