"""Entrena y serializa los modelos de recomendación para servir en producción.

Entrena NeuMF-Profile (cold start, el modelo servible hoy) con los mismos
hiperparámetros y el mismo split cold que la evaluación del harness, y guarda
en `models/`:
  - neumf_profile.pt            state_dict del modelo
  - neumf_profile_features.json transformador de features (media/std/one-hot)
  - neumf_profile_meta.json     mapeo content_id->idx, item ids, profile cols

El modelo se entrena sobre el TRAIN POOL (usuarios no cold) y se guarda la
normalización calculada solo sobre ese train pool, de modo que un usuario
nuevo en producción se normaliza con la misma escala que vio el modelo.

Uso (desde la raíz del proyecto):
    python3 plataforma/backend/scripts/train_serving_models.py

Requiere torch (el venv de la plataforma usa la extra `ml`).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim

# Ruta a la raíz del proyecto (data/ y plataforma/)
# train_serving_models.py -> scripts -> backend -> plataforma -> raíz
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_PROJECT_ROOT))

# Para poder importar app.* (paquete del servicio)
_BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND_DIR))

# Importar el harness de evaluación (para el split cold y build_profile_features)
sys.path.insert(0, str(_PROJECT_ROOT / "data" / "scripts"))
import evaluate_models as em  # noqa: E402

from app.modelos.arquitecturas import NeuMFProfile  # noqa: E402
from app.modelos.features import ProfileFeatureTransformer  # noqa: E402

SEED = 42
LATENT_DIM = 8
EPOCHS = 15
BATCH_SIZE = 32
LR = 0.001
WEIGHT_DECAY = 1e-4
COLD_RATIO = 0.10

ROOT = _PROJECT_ROOT / "plataforma" / "backend"
MODELS_DIR = ROOT / "models"


def main() -> None:
    torch.manual_seed(SEED)
    np.random.seed(SEED)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    users_df = pd.read_csv(ROOT / ".." / ".." / "data" / "users_synthetic.csv")
    contents_df = pd.read_csv(ROOT / ".." / ".." / "data" / "contents.csv")
    interactions_df = pd.read_csv(
        ROOT / ".." / ".." / "data" / "interactions_synthetic_v3.csv"
    )
    # Consolidar (un par user-content, el de mayor relevancia) igual que la eval
    interactions_df = em.consolidate_interactions(interactions_df)

    # Split cold (mismo que la evaluación): train_pool + cold users
    train_pool_df, cold_test_df, cold_users = em.create_cold_split(
        interactions_df, COLD_RATIO
    )
    print(f"Train pool: {len(train_pool_df)} | Cold users: {len(cold_users)}")

    train_pool_user_ids = train_pool_df["user_id"].unique().tolist()
    content_ids = contents_df["content_id"].tolist()
    item_to_idx = {cid: i for i, cid in enumerate(content_ids)}

    # Construir el transformador de features con las estadísticas del train pool
    all_ids = sorted(set(train_pool_user_ids) | set(cold_users))
    transformer = ProfileFeatureTransformer.from_users_df(
        users_df, stats_ids=train_pool_user_ids
    )
    print(f"Feature dim: {transformer.dim}")

    # Features de los usuarios del train pool (para entrenar)
    user_feature_map: dict[str, np.ndarray] = {}
    for uid in train_pool_user_ids:
        if uid in users_df["user_id"].values:
            row = users_df[users_df["user_id"] == uid].iloc[0].to_dict()
            user_feature_map[uid] = transformer.transform_row(row)

    # Build train tensors
    X_user, X_item, y = [], [], []
    for _, r in train_pool_df.iterrows():
        uid, cid = r["user_id"], r["content_id"]
        if uid not in user_feature_map or cid not in item_to_idx:
            continue
        X_user.append(user_feature_map[uid])
        X_item.append(item_to_idx[cid])
        y.append(float(r["score"]))

    X_user = np.asarray(X_user, dtype=np.float32)
    X_item = np.asarray(X_item, dtype=np.int64)
    y = np.asarray(y, dtype=np.float32)
    print(f"Train interactions: {len(y)}")

    model = NeuMFProfile(
        num_user_features=transformer.dim,
        num_items=len(content_ids),
        latent_dim=LATENT_DIM,
    )

    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)

    dataset = torch.utils.data.TensorDataset(
        torch.tensor(X_user), torch.tensor(X_item), torch.tensor(y)
    )
    loader = torch.utils.data.DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)

    model.train()
    for epoch in range(EPOCHS):
        total = 0.0
        for bu, bi, by in loader:
            optimizer.zero_grad()
            out = model(bu, bi)
            loss = criterion(out, by)
            loss.backward()
            optimizer.step()
            total += loss.item() * len(by)
        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"  Epoch {epoch + 1}/{EPOCHS} - Loss: {total / len(dataset):.4f}")

    # Guardar artefactos
    torch.save(model.state_dict(), MODELS_DIR / "neumf_profile.pt")

    transformer.save(MODELS_DIR / "neumf_profile_features.json")

    meta = {
        "model_type": "neumf_profile",
        "latent_dim": LATENT_DIM,
        "epochs": EPOCHS,
        "cold_ratio": COLD_RATIO,
        "content_ids": content_ids,
        "item_to_idx": item_to_idx,
        "profile_cols": transformer.candidate_columns,
        "n_train_interactions": len(y),
        "feature_dim": transformer.dim,
    }
    with open(MODELS_DIR / "neumf_profile_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Artefactos guardados en {MODELS_DIR}/")


if __name__ == "__main__":
    main()
