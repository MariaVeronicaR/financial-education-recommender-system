"""Configuración del servicio de recomendación (pydantic-settings).

La selección de modelo y de grafo se hace por variables de entorno, de modo
que cambiar de modelo = cambiar RECO_MODEL, sin tocar el código.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Modelo de recomendación activo (clave de la factory de recomendadores).
    # Valores: rule_based | most_popular | content_based | kg_rules | bpr_mf |
    #          neumf | feature_aware_neumf
    reco_model: str = "content_based"

    # Backend del grafo pedagógico: inmemory (default) | neo4j
    graph_backend: str = "inmemory"

    # Neo4j (solo si graph_backend=neo4j)
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    # CORS: orígenes permitidos para el frontend (separados por coma)
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Ruta al artefacto del modelo (checkpoint) para los modelos ML
    model_artifact_path: str = "models/"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
