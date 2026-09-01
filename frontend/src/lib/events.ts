// Registro de interacciones con el esquema de eventos del generador
// (view | started | completed | quiz_passed | quiz_failed + score).
// Los eventos de dominio (completed/quiz_passed) tienen score >= 0.5
// (relevantes); los pasivos (view/started) y los fallos (quiz_failed)
// tienen score < 0.5. Este historial es la materia prima para reentrenar
// el modelo (feedback loop).
import { supabase } from './supabase'

export type InteractionEvent =
  | 'view'
  | 'started'
  | 'completed'
  | 'quiz_passed'
  | 'quiz_failed'

// Score coherente con el evento (mismos rangos que generate_interactions_v3.py)
const EVENT_SCORE: Record<InteractionEvent, [number, number]> = {
  view: [0.1, 0.4],
  started: [0.3, 0.49],
  quiz_failed: [0.4, 0.49],
  completed: [0.6, 0.9],
  quiz_passed: [0.7, 1.0],
}

export interface RegisterInteractionArgs {
  userId: string
  contentId: string
  event: InteractionEvent
  timeSpentSeconds?: number
  isRecommended?: boolean
}

export async function registerInteraction(
  args: RegisterInteractionArgs,
): Promise<void> {
  const [lo, hi] = EVENT_SCORE[args.event]
  const score = Math.round((lo + Math.random() * (hi - lo)) * 1000) / 1000

  const { error } = await supabase.from('interactions').insert({
    user_id: args.userId,
    content_id: args.contentId,
    event: args.event,
    score,
    time_spent_seconds: args.timeSpentSeconds ?? null,
    is_recommended: args.isRecommended ?? false,
  })
  if (error) throw error
}
