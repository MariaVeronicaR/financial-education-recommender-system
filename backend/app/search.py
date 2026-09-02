"""Búsqueda libre por TF-IDF sobre el catálogo (issue #6 del plan UX).

El usuario introduce una consulta en la pestaña Explorar. Devolvemos los
contenidos cuyo `title + summary + topic` mejor matchean la consulta,
ordenados por coseno TF-IDF.

Reutiliza las stopwords de TfidfFallback para mantener un vocabulario
consistente con lo que el recomendador ya conoce. Además, normaliza
mayúsculas y acentos antes de indexar y consultar, de modo que "inversion"
matchee con "inversión" sin penalizar al usuario por no escribir tildes.
"""

from __future__ import annotations

import unicodedata
from functools import lru_cache

import numpy as np

from . import datos
from .recomendadores.fallback import SPANISH_STOP_WORDS


def _normalize(text: str) -> str:
    """lowercase + sin acentos. 'Inversión' -> 'inversion'."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


@lru_cache(maxsize=1)
def _build_index():
    """Construye (o reutiliza) el índice TF-IDF sobre el catálogo completo."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    contents = datos.get_contents_df()
    content_ids = contents["content_id"].tolist()
    title = contents["title"].fillna("").astype(str)
    summary = contents["summary"].fillna("").astype(str)
    topic = contents["topic"].fillna("").astype(str)
    raw = (title + " " + summary + " " + topic).tolist()
    texts = [_normalize(t) for t in raw]

    vectorizer = TfidfVectorizer(stop_words=SPANISH_STOP_WORDS)
    matrix = vectorizer.fit_transform(texts)
    return content_ids, vectorizer, matrix, cosine_similarity


def search(query: str, k: int = 20) -> list[tuple[str, float]]:
    """Devuelve (content_id, score) ordenados por coseno TF-IDF descendente.

    Si la consulta está vacía o no matchea nada, devuelve lista vacía
    (la UI decide qué mostrar en ese caso).
    """
    content_ids, vectorizer, matrix, cosine = _build_index()
    q = _normalize((query or "").strip())
    if not q:
        return []
    qvec = vectorizer.transform([q])
    if qvec.nnz == 0:
        return []
    sims = cosine(qvec, matrix).ravel()
    order = np.argsort(-sims)
    out: list[tuple[str, float]] = []
    for i in order[:k]:
        score = float(sims[i])
        if score <= 0:
            break
        out.append((content_ids[i], score))
    return out
