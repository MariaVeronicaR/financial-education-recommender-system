"""Servicio de recomendación (FastAPI).

Es el motor de IA del TFM. Solo expone la lógica de recomendación; la auth y
los datos de usuario los gestiona Supabase (el frontend se conecta a Supabase
directamente). Este servicio recibe el perfil del usuario por request y NO
consulta la base de datos (desacoplado de Supabase).

Endpoints:
  GET  /health          -> estado del servicio
  GET  /catalog         -> catálogo de contenidos (para el frontend)
  GET  /content/{id}    -> contenido enriquecido (tldr, key_points, quiz, texto)
  POST /recommend       -> recomendaciones personalizadas
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .contenido import get_content_payload
from .grafo.factory import build_grafo
from .orquestador import RecoOrchestrator
from .schemas import Content, RecommendationRequest, RecommendationResponse

app = FastAPI(
    title="Servicio de Recomendación — TFM",
    description="Motor de IA para la recomendación personalizada de contenidos "
    "de educación financiera. Desacoplado del modelo: se selecciona por config.",
    version="0.1.0",
)

# CORS: permitir el frontend (Vercel/Netlify en producción, localhost en dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Orquestador global (se construye una vez; el modelo se selecciona por config)
_orchestrator: RecoOrchestrator | None = None


def get_orchestrator() -> RecoOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = RecoOrchestrator()
    return _orchestrator


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "reco_model": settings.reco_model, "graph": settings.graph_backend}


@app.get("/catalog", response_model=list[Content])
def catalog() -> list[Content]:
    """Catálogo completo de contenidos (con conceptos y prerrequisitos)."""
    return build_grafo().all_contents()


@app.get("/content/{content_id}")
def content(content_id: str) -> dict:
    """Contenido enriquecido (tldr, key_points, quiz) + texto del contenido."""
    payload = get_content_payload(content_id)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"Contenido {content_id} no encontrado")
    return payload


@app.post("/recommend", response_model=RecommendationResponse)
def recommend(req: RecommendationRequest) -> RecommendationResponse:
    """Recomendaciones personalizadas para un perfil de usuario."""
    return get_orchestrator().recommend(req.profile, top_k=req.top_k)
