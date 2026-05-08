# Ryhavean YouTube — Backend (Oracle Cloud Free Tier)
# Build:  docker build -t ryhavean-yt-backend .
# Run:    docker run -d --env-file .env -p 8001:8001 ryhavean-yt-backend

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# yt-dlp runtime needs ffmpeg + ca-certs
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fs http://127.0.0.1:8001/api/ || exit 1

ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8001} --workers 2"]
