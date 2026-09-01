"""Fallback de contenido (item cold start) por TF-IDF.

NeuMF-Profile solo tiene embedding para los contenidos que estaban en el
entrenamiento. Un contenido nuevo (añadido al catálogo después de entrenar)
no tiene embedding y no puede puntuarse con el modelo. Este fallback lo
rankea por similitud TF-IDF entre el perfil del usuario (learning_goal,
intereses) y el texto del contenido (title + summary).

Se integra en los recomendadores ML para que los contenidos nuevos no queden
fuera de las recomendaciones, sino que se intercalen al final del ranking.
"""

from __future__ import annotations

import numpy as np

from .. import datos
from ..interfaces import Recomendador
from ..schemas import UserProfile

# Stopwords en español para el TF-IDF (compartidas con el harness de evaluación)
SPANISH_STOP_WORDS = [
    "un", "una", "unas", "unos", "el", "la", "las", "los", "al", "del", "lo",
    "de", "en", "para", "por", "con", "sin", "sobre", "bajo", "entre", "hasta",
    "desde", "hacia", "y", "o", "u", "e", "pero", "mas", "como", "cuando",
    "donde", "quien", "que", "cual", "cuyo",
]

# Topics que activa cada learning_goal (para construir la consulta del perfil)
GOAL_TOPICS = {
    "prepararse para invertir": {
        "inversión", "mercado", "riesgo", "diversificación", "interés", "ahorro",
    },
    "ahorrar": {"ahorro", "planificación", "cuentas bancarias", "presupuesto", "interés"},
    "presupuestar": {"planificación", "presupuesto", "deuda", "cuentas bancarias", "ahorro"},
    "planificar finanzas": {"planificación", "ahorro", "cuentas bancarias", "presupuesto", "interés"},
    "entender deuda": {"deuda", "préstamos", "hipotecas", "tarjetas", "interés"},
}


class TfidfFallback(Recomendador):
    """Rankea contenidos por similitud TF-IDF al perfil del usuario.

    Para contenido NUEVO (sin embedding en el modelo). Se construye una vez
    sobre el catálogo completo (title + summary) y, por usuario, una consulta
    a partir de su learning_goal e intereses.
    """

    name = "tfidf_fallback"

    def __init__(self) -> None:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        self._contents = datos.get_contents_df()
        self._content_ids: list[str] = self._contents["content_id"].tolist()
        texts = (
            self._contents["title"].fillna("").astype(str)
            + " "
            + self._contents["summary"].fillna("").astype(str)
        )
        self._vectorizer = TfidfVectorizer(stop_words=SPANISH_STOP_WORDS)
        self._content_matrix = self._vectorizer.fit_transform(texts)
        self._cosine = cosine_similarity

    def _query_for(self, profile: UserProfile) -> str:
        """Construye la consulta textual del perfil (learning_goal + intereses)."""
        tokens: set[str] = set()
        goal = (profile.learning_goal or "").lower()
        tokens.update(GOAL_TOPICS.get(goal, set()))
        # Intereses explícitos del perfil (topic -> valor)
        for topic, val in (profile.interests or {}).items():
            if val and val > 0:
                tokens.add(topic)
        return " ".join(tokens)

    def rank(self, profile: UserProfile) -> list[str]:
        query = self._query_for(profile)
        if not query.strip():
            # Sin señal: orden del catálogo
            return list(self._content_ids)
        qvec = self._vectorizer.transform([query])
        if qvec.nnz == 0:
            return list(self._content_ids)
        sim = self._cosine(qvec, self._content_matrix).ravel()
        order = np.argsort(-sim)
        return [self._content_ids[i] for i in order]
