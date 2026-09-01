"""Interfaces del servicio de recomendación (contratos de desacople).

El backend solo conoce estas dos interfaces, no sus implementaciones. El modelo
concreto se selecciona por configuración (RECO_MODEL, GRAPH_BACKEND). Cambiar de
modelo o de grafo = cambiar la implementación registrada, nunca reescribir la app.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from .schemas import Content, UserProfile


class Recomendador(ABC):
    """Genera un ranking crudo de contenidos para un usuario.

    El ranking es SIN filtro pedagógico: el orquestador aplica el filtro del
    grafo después. Esto mantiene el desacople entre el modelo y la pedagogía.
    """

    name: str = "recomendador"

    @abstractmethod
    def rank(self, profile: UserProfile) -> list[str]:
        """Devuelve los content_id ordenados por relevancia (mejor primero)."""
        raise NotImplementedError


class GrafoPedagogico(ABC):
    """Valida la coherencia pedagógica de las recomendaciones.

    Representa conceptos, contenidos, prerrequisitos y conceptos dominados por
    el usuario. Es la pieza que garantiza la contribución científica del TFM
    (coherencia pedagógica, §2.6.2, §4.11).
    """

    name: str = "grafo"

    @abstractmethod
    def prerequisites_of(self, concept_id: str) -> list[str]:
        """Prerrequisitos directos de un concepto."""
        raise NotImplementedError

    @abstractmethod
    def concepts_taught_by(self, content_id: str) -> list[str]:
        """Conceptos que enseña un contenido."""
        raise NotImplementedError

    @abstractmethod
    def is_accessible(self, content_id: str, mastered_concepts: set[str]) -> bool:
        """True si el usuario domina los prerrequisitos del contenido."""
        raise NotImplementedError

    @abstractmethod
    def accessible_contents(self, mastered_concepts: set[str]) -> list[str]:
        """Contenidos cuyos prerrequisitos están cubiertos por el usuario."""
        raise NotImplementedError

    @abstractmethod
    def explanation(self, content_id: str, mastered_concepts: set[str]) -> str:
        """Explicación pedagógica de por qué un contenido es (o no) accesible."""
        raise NotImplementedError

    @abstractmethod
    def all_contents(self) -> list[Content]:
        """Catálogo completo de contenidos (con conceptos y prerrequisitos)."""
        raise NotImplementedError
