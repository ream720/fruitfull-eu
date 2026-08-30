const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const configuredKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const SUPABASE_SECRET_KEY = Deno.env.get('SUPABASE_SECRET_KEY') || configuredKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;
const DISPATCH_SECRET = Deno.env.get('DISPATCH_SECRET')!;

const templates: Record<string, number> = {
  reservation: Number(Deno.env.get('BREVO_ORDER_RESERVATION_TEMPLATE_ID')),
  paid: Number(Deno.env.get('BREVO_ORDER_PAID_TEMPLATE_ID')),
  awaiting_shipment: Number(Deno.env.get('BREVO_ORDER_AWAITING_SHIPMENT_TEMPLATE_ID')),
  shipped: Number(Deno.env.get('BREVO_ORDER_SHIPPED_TEMPLATE_ID')),
  cancelled: Number(Deno.env.get('BREVO_ORDER_CANCELLED_TEMPLATE_ID')),
  expired: Number(Deno.env.get('BREVO_ORDER_EXPIRED_TEMPLATE_ID')),
};

const supabase = async (path: string, init: RequestInit = {}) => {
  const headers: Record<string, string> = {
    apikey: SUPABASE_SECRET_KEY,
    'Content-Type': 'application/json',
    ...((init.headers || {}) as Record<string, string>),
  };
  if (!SUPABASE_SECRET_KEY.startsWith('sb_secret_')) headers.Authorization = `Bearer ${SUPABASE_SECRET_KEY}`;
  return fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
};

Deno.serve(async (request) => {
  if (!DISPATCH_SECRET || request.headers.get('Authorization') !== `Bearer ${DISPATCH_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const claimedResponse = await supabase('/rest/v1/rpc/claim_notification_outbox', {
    method: 'POST', body: JSON.stringify({ p_limit: 20 }),
  });
  if (!claimedResponse.ok) return new Response('Unable to claim notifications', { status: 500 });
  const claimed = await claimedResponse.json();

  for (const notification of claimed) {
    let error: string | null = null;
    try {
      const query = new URLSearchParams({
        id: `eq.${notification.order_id}`,
        select: '*,order_items(*),drops(title,payment_instructions)',
      });
      const orderResponse = await supabase(`/rest/v1/orders?${query}`);
      const [order] = await orderResponse.json();
      const templateId = templates[notification.template_key];
      if (!order?.customer_email) throw new Error('recipient_missing');
      if (!Number.isInteger(templateId) || templateId <= 0) throw new Error('template_not_configured');

      const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': BREVO_API_KEY },
        body: JSON.stringify({
          templateId,
          to: [{ email: order.customer_email, name: order.customer_name || undefined }],
          params: {
            reference: order.reference,
            status: order.status,
            expiresAt: order.expires_at,
            currency: order.currency,
            subtotalMinor: order.subtotal_minor,
            shippingMinor: order.shipping_minor,
            totalMinor: order.total_minor,
            paymentMethod: order.payment_method,
            paymentInstructions: order.drops?.payment_instructions,
            dropTitle: order.drops?.title,
            trackingCarrier: order.tracking_carrier,
            trackingNumber: order.tracking_number,
            trackingUrl: order.tracking_url,
            items: order.order_items,
          },
        }),
      });
      if (!emailResponse.ok) throw new Error(`brevo_${emailResponse.status}`);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'notification_failed';
    }
    await supabase('/rest/v1/rpc/finish_notification', {
      method: 'POST', body: JSON.stringify({ p_id: notification.id, p_error: error }),
    });
  }

  return Response.json({ processed: claimed.length });
});
