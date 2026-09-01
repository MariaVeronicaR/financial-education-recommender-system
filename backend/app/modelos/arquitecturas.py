"""Arquitecturas de los modelos ganadores (NeuMF y NeuMF-Profile).

Copiadas fielmente de data/scripts/evaluate_models.py para que los
state_dict entrenados con el harness carguen sin cambios de nombres ni de
forma de capas.

- NeuMF (warm start): GMF + MLP sobre embeddings de user_id/content_id.
  Requiere que el user_id esté en el mapeo de entrenamiento.
- NeuMFProfile (cold start): encoder de features de perfil + embedding de
  contenido. Funciona para cualquier usuario con features de perfil.
"""

from __future__ import annotations

import torch
import torch.nn as nn


class NeuMF(nn.Module):
    """NeuMF puro (GMF + MLP). Recomienda por historial (warm start)."""

    def __init__(self, num_users: int, num_items: int, latent_dim: int = 8) -> None:
        super().__init__()

        # GMF branch
        self.gmf_user = nn.Embedding(num_users, latent_dim)
        self.gmf_item = nn.Embedding(num_items, latent_dim)

        # MLP branch
        self.mlp_user = nn.Embedding(num_users, latent_dim)
        self.mlp_item = nn.Embedding(num_items, latent_dim)

        self.mlp = nn.Sequential(
            nn.Linear(latent_dim * 2, 16),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(16, 8),
            nn.ReLU(),
            nn.Dropout(0.2),
        )

        self.output = nn.Sequential(
            nn.Linear(latent_dim + 8, 1),
            nn.Sigmoid(),
        )

    def forward(self, user_indices, item_indices):
        # GMF
        gu = self.gmf_user(user_indices)
        gi = self.gmf_item(item_indices)
        gmf = gu * gi

        # MLP
        mu = self.mlp_user(user_indices)
        mi = self.mlp_item(item_indices)
        mlp_input = torch.cat([mu, mi], dim=-1)
        mlp_output = self.mlp(mlp_input)

        # Fusion
        x = torch.cat([gmf, mlp_output], dim=-1)
        return self.output(x).squeeze(-1)


class NeuMFProfile(nn.Module):
    """Feature-aware NeuMF para cold start.

    Encoder de features de perfil (MLP) + embedding de contenido, fusionados
    en un MLP final. No depende de user_id: funciona para cualquier usuario
    con un vector de features de perfil.
    """

    def __init__(self, num_user_features: int, num_items: int, latent_dim: int = 8) -> None:
        super().__init__()

        # Encoder de perfil
        self.user_encoder = nn.Sequential(
            nn.Linear(num_user_features, 16),
            nn.ReLU(),
            nn.Linear(16, latent_dim),
        )

        # Embedding de contenido
        self.item_embed = nn.Embedding(num_items, latent_dim)

        # MLP
        self.mlp = nn.Sequential(
            nn.Linear(latent_dim * 2, 16),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(16, 8),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(8, 1),
            nn.Sigmoid(),
        )

    def forward(self, user_features, item_indices):
        u_emb = self.user_encoder(user_features)
        i_emb = self.item_embed(item_indices)
        x = torch.cat([u_emb, i_emb], dim=-1)
        return self.mlp(x).squeeze(-1)
