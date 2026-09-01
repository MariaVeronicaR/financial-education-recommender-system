"""Capa de datos del servicio de recomendación.

Lee directamente los CSV del proyecto (data/*.csv) y construye los índices
derivados (concepts_of_content, prereq_of_concept, content_diff). No depende
del harness de evaluación (data/scripts/evaluate_models.py): es autónoma y
estable, de modo que el backend no se rompe si el harness cambia.

Los datos son estáticos y se cargan una sola vez (módulo singleton).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

# Ruta a la raíz del proyecto: subimos hasta encontrar la carpeta data/.
def _find_project_root() -> Path:
    current = Path(__file__).resolve().parent
    for _ in range(6):  # subir hasta 6 niveles
        if (current / "data" / "contents.csv").exists():
            return current
        current = current.parent
    raise FileNotFoundError(
        "No se encontró data/contents.csv. El servicio IA necesita los CSV "
        "del proyecto (data/)."
    )


_PROJECT_ROOT = _find_project_root()
_DATA_DIR = _PROJECT_ROOT / "data"


def _load_csv(name: str) -> pd.DataFrame:
    path = _DATA_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"No se encontró {path}")
    return pd.read_csv(path)


# ---------------------------------------------------------------------------
# Carga única de los CSV
# ---------------------------------------------------------------------------
_users_df = _load_csv("users_synthetic.csv")
_interactions_df = _load_csv("interactions_synthetic_v3.csv")
_contents_df = _load_csv("contents.csv")
_concepts_df = _load_csv("concepts.csv")
_map_df = _load_csv("content_concept_map.csv")
_prereqs_df = _load_csv("prerequisites.csv")

# Índice: conceptos que enseña cada contenido (solo cobertura directa)
_concepts_of_content: dict[str, list[str]] = {}
for _, row in _map_df.iterrows():
    if row["coverage_type"] == "directa":
        _concepts_of_content.setdefault(row["content_id"], []).append(row["concept_id"])

# Índice: prerrequisitos de cada concepto
_prereq_of_concept: dict[str, list[str]] = {}
for _, row in _prereqs_df.iterrows():
    _prereq_of_concept.setdefault(row["concept_id"], []).append(row["prerequisite_concept_id"])

# Dificultad ordinal por contenido (básico=0, intermedio=1, avanzado=2)
_DIFF_ORD = {"básico": 0, "intermedio": 1, "avanzado": 2}
_content_diff: dict[str, int] = {
    row["content_id"]: _DIFF_ORD.get(row["difficulty"], 0)
    for _, row in _contents_df.iterrows()
}


def get_data() -> dict:
    """Dict con los datos cargados (interacciones, catálogos, índices)."""
    return {
        "users": _users_df,
        "interactions": _interactions_df,
        "contents": _contents_df,
        "concepts": _concepts_df,
        "prereqs": _prereqs_df,
        "concepts_of_content": _concepts_of_content,
        "prereq_of_concept": _prereq_of_concept,
        "content_diff": _content_diff,
    }


def get_users_df() -> pd.DataFrame:
    return _users_df


def get_interactions_df() -> pd.DataFrame:
    return _interactions_df


def get_contents_df() -> pd.DataFrame:
    return _contents_df


def get_concepts_df() -> pd.DataFrame:
    return _concepts_df


def get_prereqs_df() -> pd.DataFrame:
    return _prereqs_df


def get_concepts_of_content() -> dict:
    """{content_id: [concept_id, ...]} — conceptos que enseña cada contenido."""
    return _concepts_of_content


def get_prereq_of_concept() -> dict:
    """{concept_id: [prerequisite_concept_id, ...]} — prerrequisitos por concepto."""
    return _prereq_of_concept


def get_content_diff() -> dict:
    """{content_id: 0|1|2} — dificultad ordinal (básico/intermedio/avanzado)."""
    return _content_diff


# ---------------------------------------------------------------------------
# Utilidades para los recomendadores (autónomas, sin dependencia del harness)
# ---------------------------------------------------------------------------

def popularity_ranking() -> list[str]:
    """Ranking global por frecuencia de interacción (mayor primero).

    Reimplementa de forma autónoma el baseline de popularidad que antes
    proveía el harness. Los contenidos sin interacciones van al final.
    """
    counts = (
        _interactions_df.groupby("content_id")
        .size()
        .sort_values(ascending=False)
    )
    ranking = list(counts.index)
    # Añadir contenidos sin interacción al final (orden estable del catálogo)
    for cid in _contents_df["content_id"]:
        if cid not in ranking:
            ranking.append(cid)
    return ranking


def compute_mastery(interactions: pd.DataFrame | None = None) -> dict[str, set[str]]:
    """Conceptos dominados por cada usuario a partir de las interacciones.

    Un concepto se considera dominado cuando el usuario completa o aprueba un
    contenido que lo enseña (eventos completed/quiz_passed). Si no se pasa
    `interactions`, se usa el dataset cargado. Devuelve {user_id: {concept_id}}.
    """
    if interactions is None:
        interactions = _interactions_df
    mastery: dict[str, set[str]] = {}
    dom = interactions[interactions["event"].isin(["completed", "quiz_passed"])]
    for _, row in dom.iterrows():
        uid = row["user_id"]
        for concept in _concepts_of_content.get(row["content_id"], []):
            mastery.setdefault(uid, set()).add(concept)
    return mastery
