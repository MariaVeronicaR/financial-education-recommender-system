"""Servicio de recomendación (FastAPI).

Es el motor de IA del TFM. Solo expone la lógica de recomendación; la auth y
los datos de usuario los gestiona Supabase (el frontend se conecta a Supabase
directamente). Este servicio recibe el perfil del usuario por request y NO
consulta la base de datos (desacoplado de Supabase).

Endpoints:
  GET  /health                           -> estado del servicio
  GET  /catalog                          -> catálogo de contenidos
  GET  /content/{id}                     -> contenido enriquecido + texto
  GET  /search?q=...&k=20                -> búsqueda libre por TF-IDF
  POST /content/{id}/missing-prereqs     -> prerrequisitos que faltan
  POST /recommend                        -> recomendaciones personalizadas
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .contenido import get_content_payload
from .grafo.factory import build_grafo
from .orquestador import RecoOrchestrator
from .schemas import Content, RecommendationRequest, RecommendationResponse
from .search import search as tfidf_search

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


@app.get("/search")
def search(q: str = Query("", description="Consulta en lenguaje natural"), k: int = 20) -> dict:
    """Búsqueda libre sobre el catálogo (TF-IDF sobre title + summary + topic).

    Devuelve {query, results: [{content_id, score, content: Content}]}. El
    frontend compone esta vista con /catalog (o llama a /content/{id} para
    tener el detalle si lo necesita).
    """
    pairs = tfidf_search(q, k=k)
    if not q.strip():
        return {"query": "", "results": []}
    contents_by_id = {c.content_id: c for c in build_grafo().all_contents()}
    results = []
    for cid, score in pairs:
        meta = contents_by_id.get(cid)
        if meta is None:
            continue
        results.append(
            {
                "content_id": cid,
                "score": round(score, 4),
                "content": meta.model_dump(),
            }
        )
    return {"query": q, "results": results}


class MissingPrereqsRequest(BaseModel):
    mastered_concepts: list[str] = []


@app.post("/content/{content_id}/missing-prereqs")
def missing_prereqs(content_id: str, req: MissingPrereqsRequest) -> dict:
    """Devuelve los prerrequisitos que el usuario NO domina para `content_id`.

    El frontend usa esto para mostrar un aviso pedagógico sin bloquear el
    acceso al contenido. Devuelve {content_id, is_accessible, missing: [...]}.
    """
    grafo = build_grafo()
    mastered = set(req.mastered_concepts)
    is_accessible = grafo.is_accessible(content_id, mastered)
    if is_accessible:
        return {"content_id": content_id, "is_accessible": True, "missing": []}
    missing = grafo.missing_prerequisites(content_id, mastered)
    return {
        "content_id": content_id,
        "is_accessible": False,
        "missing": missing,
    }


@app.post("/recommend", response_model=RecommendationResponse)
def recommend(req: RecommendationRequest) -> RecommendationResponse:
    """Recomendaciones personalizadas para un perfil de usuario."""
    return get_orchestrator().recommend(req.profile, top_k=req.top_k)
