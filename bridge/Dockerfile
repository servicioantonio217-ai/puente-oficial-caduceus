FROM python:3.11-slim AS builder

WORKDIR /build
COPY pyproject.toml .
COPY src/ src/
RUN pip install --no-cache-dir --prefix=/install .

# --- Runtime ---
FROM python:3.11-slim

WORKDIR /app

COPY --from=builder /install /usr/local

RUN useradd --create-home --shell /bin/false appuser

USER appuser

EXPOSE 8643

ENV G2_HOST=0.0.0.0
ENV G2_PORT=8643
ENV G2_DATABASE_PATH=/data/g2_bridge.db

CMD ["python", "-m", "g2_bridge.main"]
