"""Implementación en memoria del grafo pedagógico (dev/default).

No requiere infraestructura (ni Neo4j): carga los CSV existentes y construye
los índices de prerrequisitos y cobertura. Es la implementación por defecto en
desarrollo y tests. Neo4jGrafo (misma interfaz) se activa por configuración
cuando se quiera validar el grafo real.
"""

from __future__ import annotations

from .. import datos
from ..interfaces import GrafoPedagogico
from ..schemas import Content


class InMemoryGrafo(GrafoPedagogico):
    """Grafo pedagógico en memoria, construido desde los CSV del proyecto."""

    name = "inmemory"

    def __init__(self) -> None:
        self._concepts_of_content = datos.get_concepts_of_content()
        self._prereq_of_concept = datos.get_prereq_of_concept()
        self._contents_df = datos.get_contents_df()
        self._concepts_df = datos.get_concepts_df()
        self._prereqs_df = datos.get_prereqs_df()
        # Índice de contenidos por id para construir objetos Content
        self._contents_by_id = {
            row["content_id"]: row for _, row in self._contents_df.iterrows()
        }

    # -- Consultas básicas -------------------------------------------------
    def prerequisites_of(self, concept_id: str) -> list[str]:
        return list(self._prereq_of_concept.get(concept_id, []))

    def concepts_taught_by(self, content_id: str) -> list[str]:
        return list(self._concepts_of_content.get(content_id, []))

    # -- Validación pedagógica --------------------------------------------
    def is_accessible(self, content_id: str, mastered_concepts: set[str]) -> bool:
        """Un contenido es accesible si el usuario domina TODOS los prerrequisitos
        de TODOS los conceptos que cubre. Conceptos sin prerrequisitos siempre
        son accesibles.

        Misma regla que el generador (generate_interactions_v3.py,
        `concepts_mastered_for`), que es la que garantiza PVR=0. Así el filtro
        pedagógico de la app replica exactamente la coherencia de los datos.
        """
        for k in self._concepts_of_content.get(content_id, []):
            for prereq in self._prereq_of_concept.get(k, []):
                if prereq not in mastered_concepts:
                    return False
        return True

    def accessible_contents(self, mastered_concepts: set[str]) -> list[str]:
        return [
            cid
            for cid in self._contents_by_id
            if self.is_accessible(cid, mastered_concepts)
        ]

    def explanation(self, content_id: str, mastered_concepts: set[str]) -> str:
        """Explicación pedagógica: por qué se recomienda (o no) un contenido.

        Sigue el patrón del §2.2.3 (KG como camino de explicación): "se
        recomienda X porque dominaste Y, prerrequisito de Z".
        """
        if self.is_accessible(content_id, mastered_concepts):
            # Buscar un prerrequisito dominado para dar una explicación concreta
            for k in self._concepts_of_content.get(content_id, []):
                prereqs = self._prereq_of_concept.get(k, [])
                dominados = [p for p in prereqs if p in mastered_concepts]
                if dominados:
                    return (
                        f"Dominas {self._concept_name(dominados[0])}, "
                        f"prerrequisito de {self._concept_name(k)}."
                    )
            return "Cumple los prerrequisitos de este contenido."
        # No accesible: señalar el prerrequisito que falta
        for k in self._concepts_of_content.get(content_id, []):
            prereqs = self._prereq_of_concept.get(k, [])
            faltan = [p for p in prereqs if p not in mastered_concepts]
            if faltan:
                return (
                    f"Requiere dominar {self._concept_name(faltan[0])} "
                    f"antes de {self._concept_name(k)}."
                )
        return ""

    # -- Catálogo ----------------------------------------------------------
    def all_contents(self) -> list[Content]:
        contents = []
        for cid, row in self._contents_by_id.items():
            contents.append(
                Content(
                    content_id=cid,
                    title=row["title"],
                    source=row.get("source", ""),
                    url=row.get("url", ""),
                    topic=row.get("topic", ""),
                    subtopic=row.get("subtopic", ""),
                    difficulty=row.get("difficulty", "básico"),
                    format=row.get("format", ""),
                    summary=row.get("summary", ""),
                    learning_objective=row.get("learning_objective", ""),
                    risk_level=row.get("risk_level", ""),
                    is_investment_related=str(row.get("is_investment_related", "no")).lower() in ("si", "true", "1"),
                    concepts_taught=self.concepts_taught_by(cid),
                    prerequisites=self._content_prerequisites(cid),
                )
            )
        return contents

    # -- Helpers -----------------------------------------------------------
    def _concept_name(self, concept_id: str) -> str:
        row = self._concepts_df[self._concepts_df["concept_id"] == concept_id]
        if not row.empty:
            return str(row.iloc[0]["concept_name"])
        return concept_id

    def _content_prerequisites(self, content_id: str) -> list[str]:
        """Prerrequisitos de un contenido = unión de prerrequisitos de los
        conceptos que enseña."""
        prereqs: set[str] = set()
        for k in self._concepts_of_content.get(content_id, []):
            prereqs.update(self._prereq_of_concept.get(k, []))
        return sorted(prereqs)
