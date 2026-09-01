"""Factory del grafo pedagógico: selecciona la implementación por configuración.

GRAPH_BACKEND=inmemory (default) -> InMemoryGrafo (sin infraestructura)
GRAPH_BACKEND=neo4j          -> Neo4jGrafo (requiere Neo4j, activable por config)
"""

from __future__ import annotations

from ..config import settings
from ..interfaces import GrafoPedagogico
from .inmemory import InMemoryGrafo


def build_grafo() -> GrafoPedagogico:
    backend = settings.graph_backend.lower()
    if backend == "neo4j":
        # Import diferido: Neo4j es opcional y solo se carga si se configura.
        from .neo4j import Neo4jGrafo

        return Neo4jGrafo()
    return InMemoryGrafo()
