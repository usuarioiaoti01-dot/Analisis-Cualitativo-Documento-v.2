import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { MODELO, hayCredenciales } from '@/lib/motor-ia';

export const dynamic = 'force-dynamic';

/**
 * GET /api/motor/estado — comprueba que la credencial funciona de verdad.
 *
 * Que `ANTHROPIC_API_KEY` esté definida no significa que sirva: una clave
 * truncada o un marcador pegado por error pasan esa comprobación y luego
 * fallan en medio de una evaluación de varios minutos. Aquí se hace una
 * llamada real —`countTokens`, que no consume tokens ni cuesta— para saberlo
 * antes de empezar.
 */
export async function GET() {
  if (!hayCredenciales()) {
    return NextResponse.json({
      configurada: false,
      valida: false,
      modelo: MODELO,
      mensaje:
        'No hay credencial configurada. Defina ANTHROPIC_API_KEY en .env.local y reinicie el servidor.',
    });
  }

  try {
    const client = new Anthropic();
    const conteo = await client.messages.countTokens({
      model: MODELO,
      messages: [{ role: 'user', content: 'ping' }],
    });

    return NextResponse.json({
      configurada: true,
      valida: true,
      modelo: MODELO,
      mensaje: `Conexión correcta con ${MODELO}.`,
      tokens_de_prueba: conteo.input_tokens,
    });
  } catch (error) {
    return NextResponse.json({
      configurada: true,
      valida: false,
      modelo: MODELO,
      mensaje: explicar(error),
    });
  }
}

/** Traduce el fallo a algo que diga qué hacer. */
function explicar(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'La credencial no es válida. Revise que ANTHROPIC_API_KEY contenga la clave completa.';
  }
  if (error instanceof Anthropic.NotFoundError) {
    return `El modelo «${MODELO}» no existe o la cuenta no tiene acceso. Revise SACD_MODELO.`;
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'La credencial es válida, pero la API está limitando las solicitudes en este momento.';
  }
  if (error instanceof Anthropic.APIError) {
    return `La API respondió ${error.status}: ${error.message}`;
  }

  const mensaje = error instanceof Error ? error.message : '';
  if (mensaje.includes('Could not resolve authentication method')) {
    return 'No se pudo resolver ninguna credencial. Defina ANTHROPIC_API_KEY y reinicie el servidor.';
  }

  return mensaje || 'No fue posible contactar con la API.';
}
