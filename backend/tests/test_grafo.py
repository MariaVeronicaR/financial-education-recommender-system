"""Tests del InMemoryGrafo (Fase 3).

Verifica la lógica pedagógica: accesibilidad por prerrequisitos y explicaciones.
Usa los datos reales del proyecto (data/*.csv).
"""

from app.grafo.inmemory import InMemoryGrafo


def test_grafo_carga_catalogo():
    grafo = InMemoryGrafo()
    contents = grafo.all_contents()
    assert len(contents) > 0
    # El catálogo real tiene ~104 contenidos
    assert len(contents) >= 100


def test_grafo_conceptos_y_prerrequisitos():
    grafo = InMemoryGrafo()
    # C12 (inversión) requiere C02 (ahorro) y C07 (inflación) según prerequisites.csv
    prereqs = grafo.prerequisites_of("C12")
    assert "C02" in prereqs
    assert "C07" in prereqs


def test_grafo_accesibilidad_por_prerrequisitos():
    grafo = InMemoryGrafo()
    # Un usuario sin conceptos dominados: solo accesibles los contenidos cuyos
    # conceptos no tienen prerrequisitos (o los tienen cubiertos).
    accesibles = grafo.accessible_contents(set())
    assert len(accesibles) > 0
    # Ningún contenido accesible debe requerir un prerrequisito no dominado
    for cid in accesibles:
        assert grafo.is_accessible(cid, set())


def test_grafo_explicacion():
    grafo = InMemoryGrafo()
    # Explicación para un contenido accesible con mastery vacío
    accesibles = grafo.accessible_contents(set())
    if accesibles:
        expl = grafo.explanation(accesibles[0], set())
        assert isinstance(expl, str)
        assert len(expl) > 0
