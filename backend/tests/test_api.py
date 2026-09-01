"""Tests de la API FastAPI (Fase 1/4).

Verifica /health, /catalog y /recommend con el recomendador por defecto
(content_based) y el grafo inmemory.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "reco_model" in body


def test_catalog():
    r = client.get("/catalog")
    assert r.status_code == 200
    contents = r.json()
    assert len(contents) >= 100
    # Cada contenido tiene id, título y dificultad
    assert all("content_id" in c and "title" in c for c in contents)


def test_recommend():
    payload = {
        "profile": {
            "user_id": "U_TEST",
            "age": 25,
            "interests": {"ahorro": 1.0, "inversión": 0.5},
        },
        "top_k": 5,
    }
    r = client.post("/recommend", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == "U_TEST"
    assert body["source_model"] == "content_based"
    assert len(body["recommendations"]) <= 5
    # Cada recomendación tiene explicación
    assert all("explanation" in rec for rec in body["recommendations"])


def test_recommend_neumf_profile():
    """NeuMF-Profile (modelo ganador cold start) rankea el catálogo completo.

    Se prueba el recomendador directamente (no vía el client global, que usa
    el modelo por defecto) para no depender de RECO_MODEL.
    """
    from pathlib import Path

    from app.recomendadores.ml import NeumfProfileRecomendador
    from app.schemas import UserProfile

    rec = NeumfProfileRecomendador(artifact_path=Path("models"))
    ranking = rec.rank(
        UserProfile(user_id="UUID_REAL_1", age=25, learning_goal="ahorrar")
    )
    # Rankea todo el catálogo (104 contenidos) sin duplicados
    assert len(ranking) == len(set(ranking))
    assert len(ranking) >= 100
