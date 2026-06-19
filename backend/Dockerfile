FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Default port (Railway overrides this via startCommand)
ENV PORT=8000

# Run the selected FastAPI entry point. Production defaults to app.main; the
# OKX MCP service sets APP_MODULE=app.okx_main:app.
CMD ["sh", "-c", "uvicorn ${APP_MODULE:-app.main:app} --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
