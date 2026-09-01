"""Tests del orquestador con dobles (Fase 1).

Verifica que el orquestador integra recomendador + grafo sin acoplarse a
implementaciones concretas: se inyectan dobles que cumplen las interfaces.
"""

from app.interfaces import GrafoPedagogico, Recomendador
from app.orquestador import RecoOrchestrator
from app.schemas import Content, UserProfile


class FakeRecomendador(Recomendador):
    name = "fake"

    def __init__(self, ranking):
        self._ranking = ranking

    def rank(self, profile):
        return list(self._ranking)


class FakeGrafo(GrafoPedagogico):
    name = "fake"

    def __init__(self, accesibles, contents):
        self._accesibles = set(accesibles)
        self._contents = {c.content_id: c for c in contents}

    def prerequisites_of(self, concept_id):
        return []

    def concepts_taught_by(self, content_id):
        return []

    def is_accessible(self, content_id, mastered_concepts):
        return content_id in self._accesibles

    def accessible_contents(self, mastered_concepts):
        return [c for c in self._accesibles]

    def explanation(self, content_id, mastered_concepts):
        return "explicación"

    def all_contents(self):
        return list(self._contents.values())


def _contents():
    return [
        Content(content_id="C001", title="A", difficulty="básico"),
        Content(content_id="C002", title="B", difficulty="básico"),
        Content(content_id="C003", title="C", difficulty="básico"),
    ]


def test_orquestador_filtra_y_explica():
    """El orquestador filtra los no accesibles y añade explicación."""
    ranking = ["C001", "C002", "C003"]
    accesibles = ["C001", "C003"]  # C002 no accesible
    reco = FakeRecomendador(ranking)
    grafo = FakeGrafo(accesibles, _contents())
    orch = RecoOrchestrator(recomendador=reco, grafo=grafo)

    resp = orch.recommend(UserProfile(user_id="U1"), top_k=10)

    assert resp.source_model == "fake"
    assert [r.content_id for r in resp.recommendations] == ["C001", "C003"]
    assert resp.n_candidates == 3
    assert resp.n_filtered == 1
    assert all(r.explanation == "explicación" for r in resp.recommendations)


def test_orquestador_respeta_top_k():
    ranking = ["C001", "C002", "C003"]
    reco = FakeRecomendador(ranking)
    grafo = FakeGrafo(ranking, _contents())
    orch = RecoOrchestrator(recomendador=reco, grafo=grafo)

    resp = orch.recommend(UserProfile(user_id="U1"), top_k=2)

    assert len(resp.recommendations) == 2
