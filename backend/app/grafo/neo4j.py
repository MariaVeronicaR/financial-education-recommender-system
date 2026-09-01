"""Implementación del grafo pedagógico sobre Neo4j (activable por config).

Misma interfaz que InMemoryGrafo. Se activa con GRAPH_BACKEND=neo4j. Requiere
un Neo4j Community accesible (local o AuraDB) y el script de import que puebla
los nodos/relaciones (REQUIERE, ENSEÑA, DOMINA).

Nota: para el prototipo desplegado se recomienda InMemoryGrafo (sin
infraestructura). Neo4j se usa para validar el grafo real en la fase final.
"""

from __future__ import annotations

from ..config import settings
from ..interfaces import GrafoPedagogico
from ..schemas import Content


class Neo4jGrafo(GrafoPedagogico):
    """Grafo pedagógico en Neo4j, consultado con Cypher."""

    name = "neo4j"

    def __init__(self) -> None:
        from neo4j import GraphDatabase

        self._driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )

    def _run(self, query: str, **params):
        with self._driver.session() as session:
            return list(session.run(query, **params))

    def prerequisites_of(self, concept_id: str) -> list[str]:
        rows = self._run(
            "MATCH (c:Concepto {concept_id:$cid})-[:REQUIERE]->(p:Concepto) "
            "RETURN p.concept_id AS pid",
            cid=concept_id,
        )
        return [r["pid"] for r in rows]

    def concepts_taught_by(self, content_id: str) -> list[str]:
        rows = self._run(
            "MATCH (c:Contenido {content_id:$cid})-[:ENSEÑA]->(k:Concepto) "
            "RETURN k.concept_id AS kid",
            cid=content_id,
        )
        return [r["kid"] for r in rows]

    def is_accessible(self, content_id: str, mastered_concepts: set[str]) -> bool:
        # Un contenido es accesible si el usuario domina TODOS los prerrequisitos
        # de TODOS los conceptos que cubre (misma regla que el generador y que
        # InMemoryGrafo, la que garantiza PVR=0). Se evalúa en Python sobre las
        # consultas del grafo.
        for k in self.concepts_taught_by(content_id):
            for prereq in self.prerequisites_of(k):
                if prereq not in mastered_concepts:
                    return False
        return True

    def accessible_contents(self, mastered_concepts: set[str]) -> list[str]:
        rows = self._run("MATCH (c:Contenido) RETURN c.content_id AS cid")
        return [r["cid"] for r in rows if self.is_accessible(r["cid"], mastered_concepts)]

    def explanation(self, content_id: str, mastered_concepts: set[str]) -> str:
        # Reutiliza la misma lógica de explicación que InMemoryGrafo, consultando
        # el grafo. Para el prototipo se delega en una implementación compartida.
        from .inmemory import InMemoryGrafo

        # Construir un grafo en memoria con los mismos datos para la explicación
        # (la explicación es texto; no requiere consultas Cypher complejas).
        return InMemoryGrafo().explanation(content_id, mastered_concepts)

    def all_contents(self) -> list[Content]:
        # El catálogo completo se sirve desde la capa de datos (CSV), no desde
        # Neo4j, para no duplicar el modelo de datos.
        from ..datos import get_contents_df

        contents = []
        for _, row in get_contents_df().iterrows():
            contents.append(
                Content(
                    content_id=row["content_id"],
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
                    concepts_taught=self.concepts_taught_by(row["content_id"]),
                    prerequisites=self._content_prerequisites(row["content_id"]),
                )
            )
        return contents

    def _content_prerequisites(self, content_id: str) -> list[str]:
        prereqs: set[str] = set()
        for k in self.concepts_taught_by(content_id):
            prereqs.update(self.prerequisites_of(k))
        return sorted(prereqs)
