"""Transformador de features de perfil serializable para NeuMF-Profile.

Replica la lógica de `build_profile_features` del harness (data/scripts/
evaluate_models.py) de forma que:
  - El espacio de columnas (one-hot + numéricas) se fija a partir de TODO
    users_df, igual que en el entrenamiento.
  - La normalización (media/std) se calcula solo sobre `stats_ids`
    (train_pool), y esa misma transformación se aplica a cualquier usuario
    nuevo en producción.
  - El transformador se serializa junto al modelo, de modo que servir
    NeuMF-Profile no depende de re-ejecutar build_profile_features.

Para un usuario nuevo (no presente en users_df) se construye el vector a
partir de un dict de atributos: las columnas numéricas se imputan con la
mediana guardada y se normalizan; las categóricas con un valor no visto se
asignan a la columna "_unknown" de su variable (que siempre existe porque el
entrenamiento imputa NaN como "unknown").
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass
class ProfileFeatureTransformer:
    """Transforma un perfil de usuario a vector de features (orden fijo).

    Se construye con `from_users_df` y se serializa con `to_dict`/`from_dict`.
    """

    candidate_columns: list[str] = field(default_factory=list)
    numeric_columns: list[str] = field(default_factory=list)
    categorical_columns: list[str] = field(default_factory=list)
    numeric_median: dict[str, float] = field(default_factory=dict)
    numeric_mean: dict[str, float] = field(default_factory=dict)
    numeric_std: dict[str, float] = field(default_factory=dict)
    # (columna_categorica, valor) -> nombre de columna final (one-hot)
    dummy_map: dict[str, str] = field(default_factory=dict)
    # (columna_categorica, valor) -> índice en el vector final
    dummy_idx: dict[str, int] = field(default_factory=dict)
    # columna categórica -> nombre de su columna "_unknown" (fallback)
    unknown_col: dict[str, str] = field(default_factory=dict)
    final_columns: list[str] = field(default_factory=list)

    # ------------------------------------------------------------------
    # Construcción
    # ------------------------------------------------------------------
    @classmethod
    def from_users_df(cls, users_df: pd.DataFrame, stats_ids=None) -> "ProfileFeatureTransformer":
        users_df = users_df.copy()

        excluded = {"user_id", "id", "userid", "user"}
        candidate_columns = [
            c for c in users_df.columns
            if c.lower() not in excluded and users_df[c].notna().any()
        ]

        if not candidate_columns:
            raise ValueError(
                "users_df no contiene variables de perfil utilizables "
                "para construir el transformador."
            )

        full = users_df.set_index("user_id")[candidate_columns].copy()

        numeric_columns = [
            c for c in full.columns if pd.api.types.is_numeric_dtype(full[c])
        ]
        categorical_columns = [
            c for c in full.columns if c not in numeric_columns
        ]

        # Imputar numéricas con la mediana global y guardarla
        numeric_median: dict[str, float] = {}
        for c in numeric_columns:
            full[c] = pd.to_numeric(full[c], errors="coerce")
            med = full[c].median()
            if pd.isna(med):
                med = 0.0
            numeric_median[c] = float(med)
            full[c] = full[c].fillna(med)

        # Imputar categóricas con "unknown"
        if categorical_columns:
            full[categorical_columns] = full[categorical_columns].fillna("unknown").astype(str)

        # One-hot (mismo orden que build_profile_features/get_dummies)
        columns_before = set(full.columns)
        full = pd.get_dummies(full, columns=categorical_columns, dummy_na=False)
        final_columns = list(full.columns)

        # Mapeo (col, valor) -> columna final
        dummy_map: dict[str, str] = {}
        for col in categorical_columns:
            for value in full.columns:
                if value.startswith(col + "_"):
                    dummy_map[f"{col}\x00{value[len(col) + 1:]}"] = value

        # Columna "_unknown" por categoría (fallback para valores no vistos)
        unknown_col: dict[str, str] = {}
        for col in categorical_columns:
            candidate = f"{col}_unknown"
            unknown_col[col] = candidate if candidate in final_columns else ""

        # Normalizar numéricas sobre stats_ids (o todos)
        stats_pop = list(stats_ids) if stats_ids is not None else list(full.index)
        stats_pop = [u for u in stats_pop if u in full.index]
        if not stats_pop:
            stats_pop = list(full.index)

        numeric_mean: dict[str, float] = {}
        numeric_std: dict[str, float] = {}
        for c in numeric_columns:
            ref = full.loc[stats_pop, c]
            mean = float(ref.mean())
            std = float(ref.std())
            if pd.notna(std) and std > 0:
                numeric_mean[c] = mean
                numeric_std[c] = std
            else:
                numeric_mean[c] = mean
                numeric_std[c] = 0.0

        # Índice de cada columna one-hot final: (columna, valor) -> índice
        dummy_idx = {}
        for i, colname in enumerate(final_columns):
            for col in categorical_columns:
                if colname.startswith(col + "_"):
                    val = colname[len(col) + 1:]
                    dummy_idx[f"{col}\x00{val}"] = i
                    break

        return cls(
            candidate_columns=candidate_columns,
            numeric_columns=numeric_columns,
            categorical_columns=categorical_columns,
            numeric_median=numeric_median,
            numeric_mean=numeric_mean,
            numeric_std=numeric_std,
            dummy_map=dummy_map,
            dummy_idx=dummy_idx,
            unknown_col=unknown_col,
            final_columns=final_columns,
        )

    # ------------------------------------------------------------------
    # Serialización
    # ------------------------------------------------------------------
    def to_dict(self) -> dict:
        return {
            "candidate_columns": self.candidate_columns,
            "numeric_columns": self.numeric_columns,
            "categorical_columns": self.categorical_columns,
            "numeric_median": self.numeric_median,
            "numeric_mean": self.numeric_mean,
            "numeric_std": self.numeric_std,
            "dummy_map": self.dummy_map,
            "dummy_idx": self.dummy_idx,
            "unknown_col": self.unknown_col,
            "final_columns": self.final_columns,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ProfileFeatureTransformer":
        return cls(**data)

    def save(self, path) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, ensure_ascii=False)

    @classmethod
    def load(cls, path) -> "ProfileFeatureTransformer":
        with open(path, "r", encoding="utf-8") as f:
            return cls.from_dict(json.load(f))

    # ------------------------------------------------------------------
    # Transformación
    # ------------------------------------------------------------------
    @property
    def dim(self) -> int:
        return len(self.final_columns)

    def transform_row(self, row: dict) -> np.ndarray:
        """Convierte un dict de atributos de perfil en el vector de features.

        `row` debe contener los campos de candidate_columns (con sus nombres
        tal como aparecen en users_synthetic.csv). Se toleran campos ausentes.
        """
        vec = np.zeros(self.dim, dtype=np.float32)

        # Numéricas: imputar con mediana y normalizar
        for c in self.numeric_columns:
            raw = row.get(c)
            try:
                v = float(raw)
            except (TypeError, ValueError):
                v = self.numeric_median.get(c, 0.0)
            if np.isnan(v):
                v = self.numeric_median.get(c, 0.0)
            std = self.numeric_std.get(c, 0.0)
            if std and std > 0:
                v = (v - self.numeric_mean.get(c, 0.0)) / std
            else:
                v = 0.0
            idx = self._numeric_index(c)
            if idx is not None:
                vec[idx] = v

        # Categóricas: one-hot
        for c in self.categorical_columns:
            val = row.get(c)
            if val is None:
                val = "unknown"
            key = f"{c}\x00{val}"
            idx = self.dummy_idx.get(key)
            if idx is None:
                # Valor no visto: activar la columna _unknown si existe
                ucol = self.unknown_col.get(c, "")
                uidx = self.dummy_idx.get(f"{c}\x00unknown")
                idx = uidx
            if idx is not None:
                vec[idx] = 1.0

        return vec

    def _numeric_index(self, col: str) -> int | None:
        # La columna numérica conserva su nombre en final_columns
        if col in self.final_columns:
            return self.final_columns.index(col)
        return None
