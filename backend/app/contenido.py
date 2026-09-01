"""Servicio de contenido: sirve el contenido enriquecido (tldr, key_points,
quiz), el texto del contenido (scraped) y/o el contenido estructurado (LLM).

Los JSONs ya existen en data/enriched/, data/scraped/ y data/structured/.
Este módulo los carga y los expone por la API, sin reconstruir nada.

Prioridad de fuentes:
  1. data/structured/<id>.json — bloques limpios generados por LLM (si existe)
  2. data/scraped/<id>.json   — bloques heurísticos del scraper (fallback)
  3. data/enriched/<id>.json  — siempre se lee para tldr/key_points/quiz
"""

from __future__ import annotations

import json
from pathlib import Path

# Ruta a las carpetas de datos
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_ENRICHED_DIR = _PROJECT_ROOT / "data" / "enriched"
_SCRAPED_DIR = _PROJECT_ROOT / "data" / "scraped"
_STRUCTURED_DIR = _PROJECT_ROOT / "data" / "structured"


def get_enriched(content_id: str) -> dict | None:
    """Devuelve el contenido enriquecido (tldr, key_points, quiz) o None."""
    path = _ENRICHED_DIR / f"{content_id}.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_scraped(content_id: str) -> dict | None:
    """Devuelve el texto/estructura del contenido (scraped) o None."""
    path = _SCRAPED_DIR / f"{content_id}.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_structured(content_id: str) -> dict | None:
    """Devuelve el contenido estructurado por LLM (title, blocks, links, warnings)
    o None. Estos JSON tienen bloques limpios (sin menús/footers), tipos
    estructurados (heading/paragraph/unordered_list/...) y, desde v2, links
    con offsets para renderizarlos como enlaces clicables dentro del texto.
    """
    path = _STRUCTURED_DIR / f"{content_id}.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_content_payload(content_id: str) -> dict | None:
    """Combina el contenido enriquecido, estructurado y/o scraped en un solo
    payload para el frontend. Devuelve None si no existe ninguno.

    Orden de prioridad para title/blocks/links/warnings:
      1. data/structured/<id>.json  (si existe — preferente)
      2. data/scraped/<id>.json    (fallback)
    data/enriched siempre se usa para tldr/key_points/quiz.
    data/scraped siempre se usa para url (no incluida en structured).
    """
    enriched = get_enriched(content_id)
    structured = get_structured(content_id)
    scraped = get_scraped(content_id)

    if enriched is None and structured is None and scraped is None:
        return None

    payload: dict = {"content_id": content_id}

    # enriched: tldr, key_points, quiz
    if enriched:
        payload["tldr"] = enriched.get("tldr", "")
        payload["key_points"] = enriched.get("key_points", [])
        payload["quiz"] = enriched.get("quiz", [])

    # structured tiene prioridad: title, blocks, links, warnings
    if structured:
        payload["title"] = structured.get("title", "")
        payload["blocks"] = structured.get("blocks", [])
        payload["links"] = structured.get("links", [])
        payload["warnings"] = structured.get("warnings", [])
    elif scraped:
        # Fallback: bloques heurísticos del scraper
        payload["title"] = scraped.get("title", "")
        payload["blocks"] = scraped.get("blocks", [])
        payload["text"] = scraped.get("text", "")
        payload["sections"] = scraped.get("sections", [])
        payload["headings"] = scraped.get("headings", [])
        payload["links"] = []

    # url: siempre del scraped (structured no la incluye)
    if scraped:
        payload["url"] = scraped.get("url", "")

    return payload
