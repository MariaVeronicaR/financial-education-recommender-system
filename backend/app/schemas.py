"""Esquemas de dominio del servicio de recomendación (Pydantic v2).

Estos esquemas definen el "contrato" que comparten el servicio IA, el frontend
y las implementaciones de los recomendadores. Son independientes del modelo de
recomendación concreto: cambiar de modelo no cambia estos esquemas.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# Dificultad y formato usados en el catálogo (data/contents.csv)
Dificultad = Literal["básico", "intermedio", "avanzado"]


class Concept(BaseModel):
    """Un concepto financiero del grafo de conocimiento."""

    concept_id: str
    concept_name: str
    description: str = ""
    topic: str = ""
    difficulty: Dificultad = "básico"


class Prerequisite(BaseModel):
    """Relación de prerrequisito entre dos conceptos."""

    concept_id: str
    prerequisite_concept_id: str
    reason: str = ""


class Content(BaseModel):
    """Un contenido educativo del catálogo."""

    content_id: str
    title: str
    source: str = ""
    url: str = ""
    topic: str = ""
    subtopic: str = ""
    difficulty: Dificultad = "básico"
    format: str = ""
    summary: str = ""
    learning_objective: str = ""
    risk_level: str = ""
    is_investment_related: bool = False
    # Conceptos que enseña este contenido (derivados del grafo)
    concepts_taught: list[str] = Field(default_factory=list)
    # Conceptos que requiere previamente (derivados del grafo)
    prerequisites: list[str] = Field(default_factory=list)


class UserProfile(BaseModel):
    """Perfil del usuario, tal como lo envía el frontend.

    Es extensible (extra='allow') para que el feature-aware model pueda usar
    más campos sin cambiar el contrato. El servicio IA recibe este perfil por
    request y NO consulta la base de datos (desacoplado de Supabase).
    """

    model_config = ConfigDict(extra="allow")

    user_id: str
    # Datos demográficos y de perfilado (alineados con users_synthetic.csv)
    age: int | None = None
    sex: str | None = None
    education_level: str | None = None
    employment_status: str | None = None
    products: list[str] = Field(default_factory=list)
    knowledge_level: str | None = None  # bajo | medio | alto (estimado)
    learning_goal: str | None = None    # objetivo de aprendizaje (users_synthetic.csv)
    saving_habit: str | None = None     # frecuente | ocasional | nunca
    investment_experience: str | None = None  # básica | ninguna
    debt_experience: str | None = None  # ninguna | baja | media | alta
    financial_behavior_level: str | None = None  # bajo | medio | alto
    financial_attitude_level: str | None = None  # bajo | medio | alto
    risk: float | None = None
    activity: float | None = None
    interests: dict[str, float] = Field(default_factory=dict)
    format_pref: dict[str, float] = Field(default_factory=dict)
    # Conceptos que el usuario ya domina (progreso, desde Supabase)
    mastered_concepts: list[str] = Field(default_factory=list)
    # Historial de contenidos ya vistos/completados (para modelos colaborativos)
    seen_content_ids: list[str] = Field(default_factory=list)
    completed_content_ids: list[str] = Field(default_factory=list)


class RecommendationRequest(BaseModel):
    """Petición de recomendaciones: el perfil del usuario."""

    profile: UserProfile
    # Número de recomendaciones a devolver (por defecto 10)
    top_k: int = 10


class RecommendationItem(BaseModel):
    """Una recomendación individual con su explicación."""

    content_id: str
    title: str
    topic: str = ""
    difficulty: Dificultad = "básico"
    format: str = ""
    summary: str = ""
    url: str = ""
    # Explicación breve de por qué se recomienda (pedagógica o del modelo)
    explanation: str = ""
    # Score/posición del ranking crudo (opcional, para depuración)
    score: float | None = None


class RecommendationResponse(BaseModel):
    """Respuesta del servicio de recomendación.

    Incluye `source_model` para trazabilidad: el frontend no conoce el modelo,
    pero la respuesta indica cuál lo generó.
    """

    user_id: str
    recommendations: list[RecommendationItem]
    source_model: str
    # Metadatos opcionales (p. ej. cuántos candidatos se filtraron)
    n_candidates: int = 0
    n_filtered: int = 0
    extra: dict[str, Any] = Field(default_factory=dict)
