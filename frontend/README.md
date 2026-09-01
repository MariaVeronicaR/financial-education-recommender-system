# Frontend (React + Vite + TypeScript)

Interfaz web del prototipo del TFM. Se conecta a **Supabase** (auth + datos) y
al **servicio de recomendación** (FastAPI) para las recomendaciones.

## Pantallas

- **Login/Registro** — Supabase Auth (email/password)
- **Inicio** — presentación de la plataforma
- **Perfil** — cuestionario de perfilado (edad, nivel, intereses)
- **Recomendaciones** — contenidos personalizados con explicación
- **Progreso** — contenidos completados y avance

## Puesta en marcha

```bash
cd frontend
npm install
cp .env.example .env.local   # rellenar VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
npm run dev
```

## Estructura

```
src/
  lib/supabase.ts    # Cliente Supabase (auth + datos)
  lib/auth.tsx       # Contexto de autenticación
  lib/api.ts         # Cliente del servicio de recomendación (FastAPI)
  pages/             # Login, Inicio, Cuestionario, Recomendaciones, Progreso
  components/        # Layout (barra de navegación)
```

## Nota sobre el modelo

El frontend **no conoce el modelo de recomendación**: recibe
`RecommendationResponse` con `source_model` y `explanations`. Cambiar de modelo
en el backend no requiere tocar el frontend.

## Despliegue

Build estático a Vercel/Netlify (free tier). Ver `../../docs/plan_aplicacion_tfm.md`
para el despliegue completo.
