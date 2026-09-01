"""Importa el catálogo y el grafo de prerrequisitos a Neo4j.

Puebla los nodos y relaciones del grafo de conocimiento financiero:
  - Nodo :Concepto (concept_id, concept_name, topic, difficulty)
  - Nodo :Contenido (content_id, title, topic, difficulty, url)
  - Relación (:Contenido)-[:ENSEÑA]->(:Concepto)
  - Relación (:Concepto)-[:REQUIERE]->(:Concepto)

Uso:
    python3 scripts/import_neo4j.py [--uri bolt://localhost:7687] [--user neo4j] [--password ...]

Requiere el paquete `neo4j` (pip install neo4j) y un Neo4j Community accesible.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Añadir el backend al path para importar la capa de datos
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import datos  # noqa: E402


def importar(uri: str, user: str, password: str) -> None:
    from neo4j import GraphDatabase

    driver = GraphDatabase.driver(uri, auth=(user, password))
    data = datos.get_data()

    with driver.session() as session:
        # Limpiar (idempotente)
        session.run("MATCH (n) DETACH DELETE n")

        # Conceptos
        for _, row in data["concepts"].iterrows():
            session.run(
                "CREATE (:Concepto {concept_id:$cid, concept_name:$name, "
                "topic:$topic, difficulty:$diff})",
                cid=row["concept_id"],
                name=row["concept_name"],
                topic=row.get("topic", ""),
                diff=row.get("difficulty", "básico"),
            )

        # Contenidos
        for _, row in data["contents"].iterrows():
            session.run(
                "CREATE (:Contenido {content_id:$cid, title:$title, topic:$topic, "
                "difficulty:$diff, url:$url})",
                cid=row["content_id"],
                title=row["title"],
                topic=row.get("topic", ""),
                diff=row.get("difficulty", "básico"),
                url=row.get("url", ""),
            )

        # Relaciones ENSEÑA (contenido -> concepto)
        for _, row in data["ccm"].iterrows():
            session.run(
                "MATCH (c:Contenido {content_id:$cid}), (k:Concepto {concept_id:$kid}) "
                "CREATE (c)-[:ENSEÑA]->(k)",
                cid=row["content_id"],
                kid=row["concept_id"],
            )

        # Relaciones REQUIERE (concepto -> prerrequisito)
        for _, row in data["prereqs"].iterrows():
            session.run(
                "MATCH (c:Concepto {concept_id:$cid}), (p:Concepto {concept_id:$pid}) "
                "CREATE (c)-[:REQUIERE]->(p)",
                cid=row["concept_id"],
                pid=row["prerequisite_concept_id"],
            )

    driver.close()
    print("Importación completada.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Importa el grafo a Neo4j")
    parser.add_argument("--uri", default="bolt://localhost:7687")
    parser.add_argument("--user", default="neo4j")
    parser.add_argument("--password", required=True)
    args = parser.parse_args()
    importar(args.uri, args.user, args.password)
