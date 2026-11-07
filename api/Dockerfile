# API FastAPI. Contexte de build = RACINE du dépôt (les règles vivent dans data/) :
#   docker build -f api/Dockerfile -t rubix-api .
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 UV_COMPILE_BYTECODE=0 UV_LINK_MODE=copy
# uv épinglé : mêmes versions que api/uv.lock (installation verrouillée par --frozen)
RUN pip install --no-cache-dir uv==0.12.19

WORKDIR /app/api
COPY api/pyproject.toml api/uv.lock api/.python-version ./
RUN uv sync --frozen --no-dev
COPY api/alembic.ini api/openapi.json ./
COPY api/app ./app
COPY api/migrations ./migrations
COPY data /app/data

# Utilisateur non-root ; la base vit sur un volume (/var/lib/rubix)
RUN useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin rubix \
    && mkdir -p /var/lib/rubix && chown rubix:rubix /var/lib/rubix
ENV RUBIX_DB_PATH=/var/lib/rubix/rubix.db RUBIX_DATA_DIR=/app/data PATH="/app/api/.venv/bin:$PATH"
VOLUME /var/lib/rubix
USER rubix
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/ready', timeout=2).status == 200 else 1)"
# Un seul worker : SQLite + sémaphore fournisseur en mémoire. Journal d'accès fourni par l'application (sans query string).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
