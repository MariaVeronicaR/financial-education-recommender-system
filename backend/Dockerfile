# Dockerfile del servicio de recomendación (despliegue a Render)
# Contexto de build: la raíz del proyecto (para poder copiar plataforma/ y data/).
#   docker build -f plataforma/backend/Dockerfile -t tfm-reco .
FROM python:3.11-slim

# Actualizar paquetes de seguridad base del sistema operativo para mitigar vulnerabilidades
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependencias pesadas (ML) al inicio para aprovechar la caché de Docker
# Se limita a CPU en la instalación de torch para evitar descargar los 3GB de CUDA,
# reduciendo el tamaño de la imagen a <500MB (crucial para el plan gratuito de Render).
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
    torch==2.1.2 \
    scikit-learn>=1.4

# Instalar dependencias del framework FastAPI y análisis de datos
RUN pip install --no-cache-dir \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.30" \
    "pydantic>=2.7" \
    "pydantic-settings>=2.3" \
    "numpy>=1.26" \
    "pandas>=2.2" \
    "python-multipart>=0.0.9"

# Copiar el código del servicio, los artefactos del modelo y los datos del catálogo
COPY plataforma/backend/app/ ./app/
COPY plataforma/backend/models/ ./models/
COPY plataforma/backend/pyproject.toml ./
COPY data/ ./data/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
