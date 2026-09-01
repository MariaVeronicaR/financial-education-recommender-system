"""Implementaciones del recomendador (interfaz Recomendador).

Los baselines se implementan de forma autónoma sobre la capa de datos
(app/datos.py), sin depender del harness de evaluación. Así el servicio es
estable y no se rompe si data/scripts/evaluate_models.py cambia.

Los modelos ML (NeuMF, NeuMF-Profile) se registran en la factory pero se
activan por configuración (RECO_MODEL) cuando el modelo esté entrenado.
"""

from __future__ import annotations

import numpy as np

from .. import datos
from ..interfaces import Recomendador
from ..schemas import UserProfile


class RuleBasedRecomendador(Recomendador):
    """Recomienda por reglas simples: prioriza contenidos del topic de interés
    del usuario, ordenados por dificultad. No usa ML ni historial."""

    name = "rule_based"

    def rank(self, profile: UserProfile) -> list[str]:
        contents = datos.get_contents_df()
        interests = profile.interests or {}
        diff = datos.get_content_diff()
        scored = []
        for _, row in contents.iterrows():
            topic_score = interests.get(row["topic"], 0.0)
            scored.append((row["content_id"], topic_score, diff.get(row["content_id"], 0)))
        scored.sort(key=lambda x: (-x[1], x[2]))
        return [c for c, _, _ in scored]


class MostPopularRecomendador(Recomendador):
    """Ranking global por frecuencia de interacción (mismo para todos)."""

    name = "most_popular"

    def __init__(self) -> None:
        self._ranked = datos.popularity_ranking()

    def rank(self, profile: UserProfile) -> list[str]:
        return list(self._ranked)


class ContentBasedRecomendador(Recomendador):
    """Similitud coseno entre el perfil de intereses del usuario y el topic del
    contenido. Funciona en cold start (no necesita historial)."""

    name = "content_based"

    def __init__(self) -> None:
        self._contents = datos.get_contents_df()
        self._topics = sorted(self._contents["topic"].unique())
        # Vector one-hot por contenido (topic -> 1.0)
        self._content_vecs: dict[str, np.ndarray] = {}
        for _, row in self._contents.iterrows():
            vec = np.zeros(len(self._topics))
            if row["topic"] in self._topics:
                vec[self._topics.index(row["topic"])] = 1.0
            self._content_vecs[row["content_id"]] = vec

    def rank(self, profile: UserProfile) -> list[str]:
        interests = profile.interests or {}
        # Si el perfil no trae intereses, intentar derivarlos del learning_goal
        # (para usuarios que vienen de users_synthetic.csv sin cuestionario).
        if not interests:
            interests = self._interests_from_goal(profile)
        uvec = np.array([interests.get(t, 0.0) for t in self._topics], dtype=float)
        norm_u = np.linalg.norm(uvec)
        if norm_u == 0:
            # Sin señal: popularidad como fallback neutro
            return datos.popularity_ranking()
        scored = {}
        for cid, cvec in self._content_vecs.items():
            denom = norm_u * np.linalg.norm(cvec)
            scored[cid] = float(np.dot(uvec, cvec) / denom) if denom > 0 else 0.0
        return sorted(scored, key=scored.get, reverse=True)

    def _interests_from_goal(self, profile: UserProfile) -> dict[str, float]:
        """Deriva un vector de intereses a partir del learning_goal del perfil.

        Es un mapeo simplificado de los learning_goal de users_synthetic.csv a
        topics, para que el baseline funcione incluso sin cuestionario.
        """
        goal = (profile.learning_goal or "").lower()
        goal_topics = {
            "prepararse para invertir": {
                "inversión": 1.0, "mercado": 0.9, "riesgo": 0.8,
                "diversificación": 0.8, "interés": 0.7, "ahorro": 0.5,
            },
            "ahorrar": {
                "ahorro": 1.0, "planificación": 0.8, "cuentas bancarias": 0.7,
                "presupuesto": 0.6, "interés": 0.5,
            },
            "presupuestar": {
                "planificación": 1.0, "presupuesto": 0.9, "deuda": 0.6,
                "cuentas bancarias": 0.6, "ahorro": 0.5,
            },
            "planificar finanzas": {
                "planificación": 1.0, "ahorro": 0.8, "cuentas bancarias": 0.6,
                "presupuesto": 0.6, "interés": 0.4,
            },
            "entender deuda": {
                "deuda": 1.0, "préstamos": 0.9, "hipotecas": 0.8,
                "tarjetas": 0.7, "interés": 0.6,
            },
        }
        return dict(goal_topics.get(goal, goal_topics["planificar finanzas"]))


class KgRulesRecomendador(Recomendador):
    """Baseline pedagógico puro: recomienda contenidos cuyos prerrequisitos
    están cubiertos, ordenados por dificultad. No personaliza más allá de la
    maestría."""

    name = "kg_rules"

    def __init__(self) -> None:
        self._mastery = datos.compute_mastery()

    def rank(self, profile: UserProfile) -> list[str]:
        mastered = set(profile.mastered_concepts)
        # Si el perfil no trae mastery, usamos la del dataset como fallback
        if not mastered:
            mastered = self._mastery.get(profile.user_id, set())
        return self._rank_with_mastery(mastered)

    def _rank_with_mastery(self, mastered: set[str]) -> list[str]:
        from ..grafo.inmemory import InMemoryGrafo

        grafo = InMemoryGrafo()
        all_ids = [c.content_id for c in grafo.all_contents()]
        coherent = [c for c in all_ids if grafo.is_accessible(c, mastered)]
        incoherent = [c for c in all_ids if c not in coherent]
        diff = datos.get_content_diff()
        coherent.sort(key=lambda c: diff.get(c, 0))
        incoherent.sort(key=lambda c: diff.get(c, 0))
        return coherent + incoherent
