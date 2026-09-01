"""Modelos de recomendación (arquitecturas NN) del servicio IA.

Contiene las arquitecturas de los modelos ganadores de la evaluación
(NeuMF y NeuMF-Profile) extraídas del harness, más el transformador de
features serializable necesario para servir NeuMF-Profile en producción.

Las arquitecturas son idénticas a las de data/scripts/evaluate_models.py
para que los state_dict entrenados carguen sin cambios.
"""

from .arquitecturas import NeuMF, NeuMFProfile
from .features import ProfileFeatureTransformer

__all__ = ["NeuMF", "NeuMFProfile", "ProfileFeatureTransformer"]
