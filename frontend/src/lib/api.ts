// Cliente HTTP para el servicio de recomendación (FastAPI).
// El frontend NO conoce el modelo: recibe RecommendationResponse con
// source_model y explanations.
import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface RecommendationItem {
  content_id: string
  title: string
  topic: string
  difficulty: string
  format: string
  summary: string
  url: string
  explanation: string
  score: number | null
}

export interface RecommendationResponse {
  user_id: string
  recommendations: RecommendationItem[]
  source_model: string
  n_candidates: number
  n_filtered: number
}

export interface UserProfile {
  user_id: string
  full_name?: string | null
  age?: number | null
  sex?: string | null
  education_level?: string | null
  employment_status?: string | null
  learning_goal?: string | null
  products?: string[]
  knowledge_level?: string | null
  risk?: number | null
  activity?: number | null
  interests?: Record<string, number>
  format_pref?: Record<string, number>
  mastered_concepts?: string[]
  seen_content_ids?: string[]
  completed_content_ids?: string[]
}

export async function getRecommendations(
  profile: UserProfile,
  topK = 10,
): Promise<RecommendationResponse> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const res = await fetch(`${API_URL}/recommend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ profile, top_k: topK }),
  })

  if (!res.ok) {
    throw new Error(`Error al obtener recomendaciones: ${res.status}`)
  }
  return res.json()
}

export interface QuizQuestion {
  question: string
  options: string[]
  correct_index: number
  concept_id?: string
  explanation?: string
}

export interface ContentBlockLink {
  text: string
  href: string
  start: number
  end: number
}

export interface ContentBlock {
  type:
    | 'heading'
    | 'paragraph'
    | 'list'           // legacy (scraped)
    | 'link_list'      // legacy
    | 'unordered_list' // structured (LLM)
    | 'ordered_list'   // structured (LLM)
    | 'glossary'
    | 'warning'
    | 'highlight'
    | 'video'
    | string          // forward-compat
  level?: number
  text?: string
  items?: (string | { text: string; href: string })[]
  style?: string
  links?: ContentBlockLink[]
  entries?: { term: string; definition: string }[]
  // nuevos (structured)
  url?: string                       // para video
  platform?: 'youtube' | 'vimeo' | 'wistia' | 'direct'
  caption?: string                   // para video
}

export interface ContentDetail {
  content_id: string
  tldr?: string
  key_points?: string[]
  quiz?: QuizQuestion[]
  title?: string
  text?: string
  sections?: unknown[]
  headings?: unknown[]
  blocks?: ContentBlock[]
  // Links a nivel raíz del payload (del structured). Cada uno puede tener
  // href y texto; los offsets solo importan si están dentro de un paragraph.
  links?: { text: string; href: string; start?: number; end?: number }[]
  warnings?: { text: string; level?: string }[]
  url?: string
}

export async function getContentDetail(contentId: string): Promise<ContentDetail> {
  const res = await fetch(`${API_URL}/content/${contentId}`)
  if (!res.ok) {
    throw new Error(`Error al obtener el contenido: ${res.status}`)
  }
  return res.json()
}
