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

    if (!apiKey || !Number.isInteger(listId) || listId <= 0) {
      console.error('Brevo contact collection environment variables are not configured');
      return jsonResponse({ success: false, error: 'Newsletter service is not configured.' }, 500);
    }

    const brevoResponse = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        email,
        listIds: [listId],
        updateEnabled: true,
      }),
    });

    if (brevoResponse.ok) {
      return jsonResponse({ success: true, alreadySubscribed: brevoResponse.status === 204 }, 200);
    }

    const brevoError = await brevoResponse.json().catch(() => null);
    const errorMessage = brevoError?.message || 'Something went wrong. Please try again.';

    // Treat an existing contact as a successful subscription request.
    if (brevoResponse.status === 400 && errorMessage.toLowerCase().includes('already exist')) {
      return jsonResponse({ success: true, alreadySubscribed: true }, 200);
    }

    console.error('Brevo API error:', brevoResponse.status, brevoError);
    return jsonResponse({ success: false, error: errorMessage }, 500);
  } catch (err) {
    console.error('Subscribe endpoint error:', err);
    return jsonResponse({ success: false, error: 'An unexpected error occurred.' }, 500);
  }
};
