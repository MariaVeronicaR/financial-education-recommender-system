# Dockerfile del servicio de recomendación (despliegue a Render)
# Contexto de build: la raíz del repositorio

FROM python:3.11-slim

# Actualizar paquetes de seguridad base del sistema operativo
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependencias pesadas (ML) usando CPU
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
    torch==2.1.2 \
    "scikit-learn>=1.4"

# Instalar dependencias del framework FastAPI y análisis de datos
RUN pip install --no-cache-dir \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.30" \
    "pydantic>=2.7" \
    "pydantic-settings>=2.3" \
    "numpy<2" \
    "pandas>=2.2,<2.3" \
    "python-multipart>=0.0.9"

# Copiar código, modelos y datos desde la raíz del repositorio
COPY backend/app/ ./app/
COPY backend/models/ ./models/
COPY backend/pyproject.toml ./
COPY data/ ./data/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
