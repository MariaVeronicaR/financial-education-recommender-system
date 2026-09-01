"""Factory de recomendadores: selecciona la implementación por configuración.

RECO_MODEL=rule_based | most_popular | content_based | kg_rules |
           neumf | neumf_profile

- neumf_profile (alias: feature_aware_neumf) = modelo ganador cold start.
- neumf (warm) requiere reentrenar con user_id reales (feedback loop).

Cambiar de modelo = cambiar RECO_MODEL, sin tocar el resto de la app.
"""

from __future__ import annotations

from ..config import settings
from ..interfaces import Recomendador
from .baselines import (
    ContentBasedRecomendador,
    KgRulesRecomendador,
    MostPopularRecomendador,
    RuleBasedRecomendador,
)


def build_recomendador() -> Recomendador:
    key = settings.reco_model.lower()
    if key == "rule_based":
        return RuleBasedRecomendador()
    if key == "most_popular":
        return MostPopularRecomendador()
    if key == "content_based":
        return ContentBasedRecomendador()
    if key == "kg_rules":
        return KgRulesRecomendador()
    if key == "neumf":
        from .ml import NeumfRecomendador

        return NeumfRecomendador()
    if key in ("neumf_profile", "feature_aware_neumf"):
        # feature_aware_neumf es el nombre antiguo; neuMF-profile es el modelo
        # ganador del escenario cold start.
        from .ml import NeumfProfileRecomendador

        return NeumfProfileRecomendador()
    raise ValueError(
        f"RECO_MODEL desconocido: {key}. "
        "Valores válidos: rule_based, most_popular, content_based, kg_rules, "
        "bpr_mf, neumf, feature_aware_neumf."
    )
