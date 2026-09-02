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
        completed = set(profile.completed_content_ids)

        # 1. Pedir MÁS candidatos al modelo de los que vamos a devolver.
        #    Si el usuario ya completó los top-k, el ranking puro nos los
        #    devolvería otra vez. Con overfetch (×3, mín. 30) pedimos al
        #    modelo puestos 11-30 que aún son recomendaciones reales del
        #    mismo algoritmo y pueden llenar top_k sin recurrir a TF-IDF.
        n_overfetch = max(top_k * 3, 30)
        raw = self.recomendador.rank(profile)[:n_overfetch]

        # 2. Excluir ya completados. completed_content_ids llega en
        #    UserProfile desde el frontend (buildUserProfile).
        nuevos = [c for c in raw if c not in completed]

        # 3. Filtro pedagógico (post-filtro): solo contenidos accesibles
        accesibles = [c for c in nuevos if self.grafo.is_accessible(c, mastered)]
        n_filtered = len(raw) - len(accesibles)

        # 4. Recortar a top_k y construir respuesta
        visibles = accesibles[:top_k]
        items: list[RecommendationItem] = []
        for cid in visibles:
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

        # 5. Estado "agotado": quedan menos de top_k contenidos nuevos
        #    accesibles. La UI usa esta señal para mostrar "Estás al día".
        agotado = len(visibles) < top_k

        return RecommendationResponse(
            user_id=profile.user_id,
            recommendations=items,
            source_model=self.recomendador.name,
            n_candidates=len(raw),
            n_filtered=n_filtered,
            agotado=agotado,
        )
