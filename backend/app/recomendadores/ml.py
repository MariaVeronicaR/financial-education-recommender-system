"""Implementaciones ML del recomendador (NeuMF, NeuMF-Profile).

NeuMF-Profile (cold start) es el modelo servible hoy: funciona por features de
perfil, así que sirve para un usuario real nuevo que acaba de hacer el
cuestionario. Se carga desde checkpoint (state_dict + transformador de
features + meta) serializado por scripts/train_serving_models.py.

NeuMF (warm start) requiere que el user_id esté en el mapeo de entrenamiento
(usuarios sintéticos U0001-U1916). Un usuario real de la app no está en ese
mapeo, así que NeuMF warm solo tiene sentido tras reentrenar con interacciones
reales (feedback loop). Hasta entonces no es servible para usuarios nuevos.

Ambos usan fallback de popularidad para los contenidos sin embedding (item
cold start) o para usuarios sin features.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch

from .. import datos
from ..config import settings
from ..interfaces import Recomendador
from ..schemas import UserProfile
from ..modelos.arquitecturas import NeuMFProfile
from ..modelos.features import ProfileFeatureTransformer
from .fallback import TfidfFallback


def _load_json(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


class NeumfProfileRecomendador(Recomendador):
    """NeuMF-Profile: recomendación por features de perfil (cold start).

    Es el modelo ganador del escenario cold start. Recibe un UserProfile y
    construye el vector de features con el transformador serializado, lo
    pasa por el modelo y rankea el catálogo.
    """

    name = "neumf_profile"

    def __init__(self, artifact_path: Path | None = None) -> None:
        base = artifact_path or Path(settings.model_artifact_path)
        self._meta_path = base / "neumf_profile_meta.json"
        self._features_path = base / "neumf_profile_features.json"
        self._state_path = base / "neumf_profile.pt"

        if not self._meta_path.exists() or not self._features_path.exists():
            raise FileNotFoundError(
                f"Artefactos de NeuMF-Profile no encontrados en {base}. "
                "Ejecuta scripts/train_serving_models.py o usa un baseline."
            )

        self._meta = _load_json(self._meta_path)
        self._transformer = ProfileFeatureTransformer.load(self._features_path)
        self._content_ids: list[str] = self._meta["content_ids"]
        self._item_to_idx: dict[str, int] = self._meta["item_to_idx"]

        self._model = NeuMFProfile(
            num_user_features=self._transformer.dim,
            num_items=len(self._content_ids),
            latent_dim=self._meta.get("latent_dim", 8),
        )
        if self._state_path.exists():
            self._model.load_state_dict(
                torch.load(self._state_path, map_location="cpu", weights_only=True)
            )
        self._model.eval()

        # Fallback de popularidad para usuarios sin features / ítems sin embedding
        self._popular = datos.popularity_ranking()
        # Fallback de contenido (TF-IDF) para contenidos NUEVOS sin embedding
        self._tfidf = TfidfFallback()

    def rank(self, profile: UserProfile) -> list[str]:
        # 1. Construir el vector de features del perfil
        row = self._profile_to_row(profile)
        vec = self._transformer.transform_row(row)

        # 2. Score de todos los contenidos con embedding
        idxs = torch.tensor(
            [self._item_to_idx[cid] for cid in self._content_ids],
            dtype=torch.long,
        )
        user_feat = torch.tensor(vec, dtype=torch.float32).repeat(len(self._content_ids), 1)

        with torch.no_grad():
            scores = self._model(user_feat, idxs).cpu().numpy()

        # 3. Ranking de los contenidos conocidos: score descendente
        pairs = list(zip(self._content_ids, scores))
        pairs.sort(key=lambda x: -x[1])
        ranked = [cid for cid, _ in pairs]

        # 4. Contenidos NUEVOS (sin embedding en el modelo): se rankean por
        #    TF-IDF al perfil y se intercalan al final, para que el item cold
        #    start no quede fuera de las recomendaciones.
        catalog_ids = datos.get_contents_df()["content_id"].tolist()
        known = set(self._content_ids)
        new_ids = [cid for cid in catalog_ids if cid not in known]
        if new_ids:
            new_ranked = [
                cid for cid in self._tfidf.rank(profile) if cid in new_ids
            ]
            ranked += new_ranked

        return ranked

    def _profile_to_row(self, profile: UserProfile) -> dict:
        """Convierte un UserProfile al dict de candidate_columns del transformador.

        El transformador espera los nombres de columna de users_synthetic.csv.
        UserProfile usa nombres ligeramente distintos (age_group vs age,
        knowledge_level vs financial_knowledge_level), así que se mapean. Los
        campos ausentes se dejan sin valor (el transformador imputa con la
        mediana / "unknown", igual que en el entrenamiento).
        """
        row: dict = {}
        # age_group se deriva de age
        if profile.age is not None:
            row["age_group"] = "18-24" if profile.age <= 24 else "25-34"
        if profile.sex:
            row["sex"] = profile.sex
        if profile.education_level:
            row["education_level"] = profile.education_level
        if profile.employment_status:
            row["employment_status"] = profile.employment_status
        # knowledge_level -> financial_knowledge_level
        if profile.knowledge_level:
            row["financial_knowledge_level"] = profile.knowledge_level
        if profile.learning_goal:
            row["learning_goal"] = profile.learning_goal
        if profile.saving_habit:
            row["saving_habit"] = profile.saving_habit
        if profile.investment_experience:
            row["investment_experience"] = profile.investment_experience
        if profile.debt_experience:
            row["debt_experience"] = profile.debt_experience
        if profile.financial_behavior_level:
            row["financial_behavior_level"] = profile.financial_behavior_level
        if profile.financial_attitude_level:
            row["financial_attitude_level"] = profile.financial_attitude_level
        return row


class NeumfRecomendador(Recomendador):
    """NeuMF puro (warm start). Requiere historial con user_id en el mapeo.

    Un usuario real de la app no está en el mapeo de entrenamiento (usuarios
    sintéticos), así que este modelo solo sirve tras reentrenar con
    interacciones reales. Hasta entonces, recomendamos popularidad.
    """

    name = "neumf"

    def __init__(self, artifact_path: Path | None = None) -> None:
        base = artifact_path or Path(settings.model_artifact_path)
        self._state_path = base / "neumf.pt"
        self._popular = datos.popularity_ranking()
        if not self._state_path.exists():
            raise FileNotFoundError(
                f"Artefacto NeuMF warm no encontrado: {self._state_path}. "
                "NeuMF warm requiere reentrenar con user_id reales (feedback "
                "loop). Usa RECO_MODEL=neumf_profile para cold start."
            )

    def rank(self, profile: UserProfile) -> list[str]:
        # Sin user_id en el mapeo -> fallback de popularidad
        return list(self._popular)
