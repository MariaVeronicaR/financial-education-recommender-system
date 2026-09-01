"""Tests de los esquemas de dominio (Fase 1)."""

from app.schemas import (
    Content,
    RecommendationResponse,
    UserProfile,
)


def test_user_profile_extensible():
    """UserProfile debe aceptar campos extra (para features futuras del modelo)."""
    p = UserProfile(user_id="U1", age=25, campo_extra="valor")
    assert p.user_id == "U1"
    assert p.age == 25
    assert p.campo_extra == "valor"  # extra='allow'


def test_user_profile_defaults():
    p = UserProfile(user_id="U1")
    assert p.mastered_concepts == []
    assert p.interests == {}
    assert p.seen_content_ids == []


def test_recommendation_response_has_source_model():
    """La respuesta debe incluir source_model para trazabilidad."""
    r = RecommendationResponse(
        user_id="U1",
        recommendations=[],
        source_model="content_based",
    )
    assert r.source_model == "content_based"
    assert r.n_candidates == 0


def test_content_schema():
    c = Content(content_id="C001", title="Presupuesto", difficulty="básico")
    assert c.content_id == "C001"
    assert c.concepts_taught == []
    assert c.prerequisites == []
