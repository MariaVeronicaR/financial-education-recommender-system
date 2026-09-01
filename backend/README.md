# Servicio de Recomendación (motor de IA del TFM)

Backend FastAPI que genera recomendaciones personalizadas de contenidos de
educación financiera. Es el **motor de IA** del TFM: la auth y los datos de
usuario los gestiona Supabase (el frontend se conecta a Supabase directamente).

## Arquitectura (desacoplada)

El servicio solo conoce dos **interfaces** (`Recomendador` y `GrafoPedagogico`),
no sus implementaciones. El modelo concreto se selecciona por configuración:

- `RECO_MODEL` → qué recomendador usar (`content_based`, `kg_rules`, `neumf`, …)
- `GRAPH_BACKEND` → qué grafo pedagógico (`inmemory` por defecto, `neo4j` opcional)

**Cambiar de modelo = cambiar una variable de entorno, no reescribir la app.**

```
app/
  schemas.py          # Esquemas de dominio (Pydantic v2) — el contrato
  interfaces.py       # Recomendador y GrafoPedagogico (ABC)
  datos.py            # Capa de datos (reutiliza data/scripts/evaluate_models.py)
  config.py           # Configuración (pydantic-settings)
  orquestador.py      # RecoOrchestrator: ranking → filtro → explicación
  main.py             # FastAPI: /health, /catalog, /recommend
  grafo/              # Implementaciones del grafo (inmemory, neo4j)
  recomendadores/     # Implementaciones del recomendador (baselines, ml)
```

## Puesta en marcha

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
cp .env.example .env   # ajustar RECO_MODEL, etc.
.venv/bin/uvicorn app.main:app --reload
```

Endpoints:
- `GET /health` — estado y modelo activo
- `GET /catalog` — catálogo de contenidos
- `POST /recommend` — recomendaciones (body: `{profile, top_k}`)

## Tests

```bash
.venv/bin/python -m pytest -q
```

## Modelos ML (NeuMF-Profile, NeuMF)

El modelo servible hoy es **NeuMF-Profile** (ganador del escenario cold start):
funciona por features de perfil, así que sirve para un usuario real nuevo que
acaba de hacer el cuestionario.

```bash
# Entrenar y serializar el modelo (desde la raíz del proyecto):
python3 plataforma/backend/scripts/train_serving_models.py
# y en .env: RECO_MODEL=neumf_profile
```

Genera en `models/`: `neumf_profile.pt`, `neumf_profile_features.json` y
`neumf_profile_meta.json`.

**NeuMF (warm start)** aprende embeddings de `user_id` sobre los usuarios
sintéticos del harness. Un usuario real de la app no está en ese mapeo, así que
NeuMF warm solo es servible tras reentrenar con interacciones reales (feedback
loop). Hasta entonces se usa NeuMF-Profile (cold start) o un baseline.

Requiere la extra `ml`:
```bash
.venv/bin/python -m pip install torch
```

## Grafo Neo4j (opcional)

Por defecto se usa `InMemoryGrafo` (sin infraestructura). Para validar el grafo
real con Neo4j:

```bash
.venv/bin/pip install neo4j
.venv/bin/python scripts/import_neo4j.py --password TU_PASSWORD
# y en .env: GRAPH_BACKEND=neo4j
```

## Despliegue

El servicio se despliega a Render (free tier) con un Dockerfile. Ver
`../../docs/plan_aplicacion_tfm.md` para el despliegue completo (incluye
cómo generar los artefactos del modelo, que no están en git).
