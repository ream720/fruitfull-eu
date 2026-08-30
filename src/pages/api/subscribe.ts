export const prerender = false;

import type { APIRoute } from 'astro';

const jsonResponse = (body: Record<string, unknown>, status: number) => new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } }
);

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const consent = body?.consent === true;

    if (!email) {
      return jsonResponse({ success: false, error: 'Email is required.' }, 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return jsonResponse({ success: false, error: 'Please enter a valid email address.' }, 400);
    }

    if (!consent) {
      return jsonResponse(
        { success: false, error: 'Please confirm that you want to receive email updates.' },
        400
      );
    }

    const apiKey = import.meta.env.BREVO_API_KEY;
    const listId = Number(import.meta.env.BREVO_LIST_ID);
    const templateId = Number(import.meta.env.BREVO_DOI_TEMPLATE_ID);
    const redirectionUrl = import.meta.env.BREVO_DOI_REDIRECT_URL
      || 'https://fruitfullseeds.eu.com/?newsletter=confirmed#newsletter';

    if (
      !apiKey
      || !Number.isInteger(listId)
      || listId <= 0
      || !Number.isInteger(templateId)
      || templateId <= 0
    ) {
      console.error('Brevo double-opt-in environment variables are not configured');
      return jsonResponse({ success: false, error: 'Newsletter service is not configured.' }, 500);
    }

    const brevoResponse = await fetch('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        email,
        includeListIds: [listId],
        templateId,
        redirectionUrl,
      }),
    });

    if (brevoResponse.ok) {
      return jsonResponse({ success: true, confirmationRequired: true }, 200);
    }

    const brevoError = await brevoResponse.json().catch(() => null);
    const errorMessage = brevoError?.message || 'Something went wrong. Please try again.';

    // Existing contacts may already be subscribed or have a confirmation pending.
    if (brevoResponse.status === 400 && errorMessage.toLowerCase().includes('already exist')) {
      return jsonResponse({ success: true, confirmationRequired: true }, 200);
    }

    console.error('Brevo API error:', brevoResponse.status, brevoError);
    return jsonResponse({ success: false, error: errorMessage }, 500);
  } catch (err) {
    console.error('Subscribe endpoint error:', err);
    return jsonResponse({ success: false, error: 'An unexpected error occurred.' }, 500);
  }
};
