"""Orquestador de recomendación: integra el recomendador y el grafo pedagógico.

Flujo (alineado con el borrador §5.1.3 y §2.6.4):
  1. El recomendador genera un ranking crudo de contenidos candidatos.
  2. El grafo pedagógico filtra los que no cumplen prerrequisitos (post-filtro).
  3. Se genera una explicación breve para cada recomendación.
  4. Se devuelve la respuesta final con trazabilidad (source_model).

El orquestador solo conoce las interfaces Recomendador y GrafoPedagogico, no sus
implementaciones. Cambiar de modelo o de grafo no cambia esta lógica.
"""

from __future__ import annotations

from .grafo.factory import build_grafo
from .interfaces import GrafoPedagogico, Recomendador
from .recomendadores.factory import build_recomendador
from .schemas import (
    RecommendationItem,
    RecommendationResponse,
    UserProfile,
)


class RecoOrchestrator:
    """Coordina recomendador + grafo para producir recomendaciones finales."""

    def __init__(
        self,
        recomendador: Recomendador | None = None,
        grafo: GrafoPedagogico | None = None,
    ) -> None:
        # Se inyectan o se construyen por configuración (permite tests con dobles)
        self.recomendador = recomendador or build_recomendador()
        self.grafo = grafo or build_grafo()
        self._contents_by_id = {c.content_id: c for c in self.grafo.all_contents()}

    def recommend(self, profile: UserProfile, top_k: int = 10) -> RecommendationResponse:
        mastered = set(profile.mastered_concepts)

        # 1. Ranking crudo del modelo (sin filtro pedagógico)
        ranking = self.recomendador.rank(profile)
        n_candidates = len(ranking)

        # 2. Filtro pedagógico (post-filtro): solo contenidos accesibles
        accesibles = [c for c in ranking if self.grafo.is_accessible(c, mastered)]
        n_filtered = n_candidates - len(accesibles)

        # 3. Explicación + construcción de la respuesta
        items: list[RecommendationItem] = []
        for cid in accesibles[:top_k]:
            content = self._contents_by_id.get(cid)
            if content is None:
                continue
            items.append(
                RecommendationItem(
                    content_id=cid,
                    title=content.title,
                    topic=content.topic,
                    difficulty=content.difficulty,
                    format=content.format,
                    summary=content.summary,
                    url=content.url,
                    explanation=self.grafo.explanation(cid, mastered),
                )
            )

        return RecommendationResponse(
            user_id=profile.user_id,
            recommendations=items,
            source_model=self.recomendador.name,
            n_candidates=n_candidates,
            n_filtered=n_filtered,
        )
