create extension if not exists pgcrypto;

do $$ begin
  create type public.order_status as enum (
    'awaiting_payment', 'paid', 'awaiting_shipment', 'shipped', 'cancelled', 'expired'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.drops (
  id text primary key,
  slug text not null unique,
  title text not null,
  description text not null,
  opens_at timestamptz not null,
  closes_at timestamptz,
  currency text not null check (currency = 'USD'),
  shipping_amount_minor integer not null check (shipping_amount_minor = 1000),
  payment_methods text[] not null check (payment_methods = array['PayPal']::text[]),
  payment_instructions text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or closes_at > opens_at)
);

create table if not exists public.drop_items (
  id text primary key,
  drop_id text not null references public.drops(id),
  sku text not null unique,
  name text not null,
  item_type text not null,
  artist text not null,
  image_path text not null,
  description text not null,
  amount_minor integer not null check (amount_minor >= 0),
  stock_total integer not null check (stock_total >= 0),
  stock_available integer not null check (stock_available >= 0 and stock_available <= stock_total),
  max_per_order integer not null check (max_per_order > 0),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  drop_id text not null references public.drops(id),
  status public.order_status not null default 'awaiting_payment',
  version integer not null default 1,
  idempotency_key uuid not null unique,
  customer_name text,
  customer_email text,
  customer_phone text,
  payment_method text,
  payment_name text,
  customer_notes text,
  internal_notes text,
  shipping_address jsonb,
  currency text not null check (currency = 'USD'),
  subtotal_minor integer not null check (subtotal_minor >= 0),
  shipping_minor integer not null check (shipping_minor = 1000),
  total_minor integer not null check (total_minor = subtotal_minor + shipping_minor),
  expires_at timestamptz not null,
  paid_at timestamptz,
  awaiting_shipment_at timestamptz,
  shipped_at timestamptz,
  cancelled_at timestamptz,
  tracking_carrier text,
  tracking_number text,
  tracking_url text,
  inventory_released_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  drop_item_id text not null references public.drop_items(id),
  sku text not null,
  name text not null,
  item_type text not null,
  artist text not null,
  image_path text not null,
  quantity integer not null check (quantity > 0),
  unit_amount_minor integer not null check (unit_amount_minor >= 0),
  line_total_minor integer not null check (line_total_minor = quantity * unit_amount_minor),
  currency text not null check (currency = 'USD'),
  shipping_amount_minor integer not null check (shipping_amount_minor = 1000),
  shipping_address jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null,
  from_status public.order_status,
  to_status public.order_status,
  actor_email text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists orders_drop_status_idx on public.orders(drop_id, status);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists orders_email_idx on public.orders(drop_id, lower(customer_email));
create index if not exists orders_phone_idx on public.orders(drop_id, customer_phone);
create unique index if not exists orders_one_live_email_idx on public.orders(drop_id, lower(customer_email))
  where status in ('awaiting_payment', 'paid', 'awaiting_shipment');
create unique index if not exists orders_one_live_phone_idx on public.orders(drop_id, customer_phone)
  where status in ('awaiting_payment', 'paid', 'awaiting_shipment');
create index if not exists drop_items_drop_idx on public.drop_items(drop_id);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_drop_item_idx on public.order_items(drop_item_id);
create index if not exists order_events_order_idx on public.order_events(order_id, created_at desc);
create index if not exists outbox_order_idx on public.notification_outbox(order_id);
create index if not exists outbox_pending_idx on public.notification_outbox(sent_at, locked_at, created_at);

alter table public.drops enable row level security;
alter table public.drop_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on public.drops, public.drop_items, public.orders, public.order_items,
  public.order_events, public.notification_outbox from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

create or replace function public.sync_drop_catalog(p_drop jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  existing public.drop_items%rowtype;
  new_total integer;
  consumed integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'drop_requires_items';
  end if;
  if upper(p_drop->>'currency') <> 'USD' then raise exception 'currency_must_be_usd'; end if;
  if (p_drop->>'shippingAmountMinor')::integer <> 1000 then raise exception 'shipping_must_be_1000'; end if;
  if p_drop->'paymentMethods' <> '["PayPal"]'::jsonb then raise exception 'payment_method_must_be_paypal'; end if;

  insert into public.drops (
    id, slug, title, description, opens_at, closes_at, currency,
    shipping_amount_minor, payment_methods, payment_instructions, active, updated_at
  ) values (
    p_drop->>'id', p_drop->>'slug', p_drop->>'title', p_drop->>'description',
    (p_drop->>'opensAt')::timestamptz, nullif(p_drop->>'closesAt', '')::timestamptz,
    upper(p_drop->>'currency'), (p_drop->>'shippingAmountMinor')::integer,
    array(select jsonb_array_elements_text(p_drop->'paymentMethods')),
    p_drop->>'paymentInstructions', coalesce((p_drop->>'active')::boolean, false), now()
  )
  on conflict (id) do update set
    slug = excluded.slug, title = excluded.title, description = excluded.description,
    opens_at = excluded.opens_at, closes_at = excluded.closes_at, currency = excluded.currency,
    shipping_amount_minor = excluded.shipping_amount_minor,
    payment_methods = excluded.payment_methods, payment_instructions = excluded.payment_instructions,
    active = excluded.active, updated_at = now();

  for item in select value from jsonb_array_elements(p_items)
  loop
    new_total := (item->>'stockTotal')::integer;
    select * into existing from public.drop_items where id = item->>'id' for update;
    if found then
      if existing.drop_id <> p_drop->>'id' then raise exception 'item_drop_cannot_change'; end if;
      consumed := existing.stock_total - existing.stock_available;
      if new_total < consumed then raise exception 'stock_below_committed:%', item->>'id'; end if;
      update public.drop_items set
        sku = item->>'sku', name = item->>'name', item_type = item->>'type',
        artist = item->>'artist', image_path = item->>'image', description = item->>'description',
        amount_minor = (item->>'amountMinor')::integer, stock_total = new_total,
        stock_available = new_total - consumed, max_per_order = (item->>'maxPerOrder')::integer,
        active = coalesce((item->>'active')::boolean, false), updated_at = now()
      where id = item->>'id';
    else
      insert into public.drop_items (
        id, drop_id, sku, name, item_type, artist, image_path, description,
        amount_minor, stock_total, stock_available, max_per_order, active
      ) values (
        item->>'id', p_drop->>'id', item->>'sku', item->>'name', item->>'type',
        item->>'artist', item->>'image', item->>'description', (item->>'amountMinor')::integer,
        new_total, new_total, (item->>'maxPerOrder')::integer,
        coalesce((item->>'active')::boolean, false)
      );
    end if;
  end loop;
  return jsonb_build_object('id', p_drop->>'id', 'syncedItems', jsonb_array_length(p_items));
end;
$$;

create or replace function public.create_reservation(
  p_drop_id text,
  p_items jsonb,
  p_customer jsonb,
  p_shipping jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  drop_row public.drops%rowtype;
  item_row public.drop_items%rowtype;
  existing_order public.orders%rowtype;
  created_order public.orders%rowtype;
  requested jsonb;
  quantity integer;
  subtotal integer := 0;
  normalized_email text := lower(trim(p_customer->>'email'));
  normalized_phone text := trim(p_customer->>'phone');
begin
  select * into existing_order from public.orders where idempotency_key = p_idempotency_key;
  if found then
    select * into drop_row from public.drops where id = existing_order.drop_id;
    return jsonb_build_object(
      'id', existing_order.id, 'reference', existing_order.reference,
      'status', existing_order.status, 'expiresAt', existing_order.expires_at,
      'currency', existing_order.currency, 'subtotalMinor', existing_order.subtotal_minor,
      'shippingMinor', existing_order.shipping_minor, 'totalMinor', existing_order.total_minor,
      'paymentInstructions', drop_row.payment_instructions
    );
  end if;

  select * into drop_row from public.drops where id = p_drop_id for share;
  if not found or not drop_row.active then raise exception 'drop_unavailable'; end if;
  if now() < drop_row.opens_at then raise exception 'drop_not_open'; end if;
  if drop_row.closes_at is not null and now() >= drop_row.closes_at then raise exception 'drop_closed'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'items_required'; end if;
  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct value->>'itemId') from jsonb_array_elements(p_items)) then
    raise exception 'duplicate_items';
  end if;
  if not ((p_customer->>'paymentMethod') = any(drop_row.payment_methods)) then raise exception 'payment_method_invalid'; end if;
  if exists (
    select 1 from public.orders
    where drop_id = p_drop_id and status in ('awaiting_payment', 'paid', 'awaiting_shipment')
      and (lower(customer_email) = normalized_email or customer_phone = normalized_phone)
  ) then raise exception 'active_reservation_exists'; end if;

  for requested in select value from jsonb_array_elements(p_items) order by value->>'itemId'
  loop
    quantity := (requested->>'quantity')::integer;
    select * into item_row from public.drop_items
      where id = requested->>'itemId' and drop_id = p_drop_id for update;
    if not found or not item_row.active then raise exception 'item_unavailable:%', requested->>'itemId'; end if;
    if quantity < 1 or quantity > item_row.max_per_order then raise exception 'quantity_invalid:%', item_row.id; end if;
    if item_row.stock_available < quantity then raise exception 'insufficient_stock:%', item_row.id; end if;
    subtotal := subtotal + item_row.amount_minor * quantity;
  end loop;

  begin
    insert into public.orders (
      reference, drop_id, idempotency_key, customer_name, customer_email, customer_phone,
      payment_method, payment_name, customer_notes, shipping_address, currency,
      subtotal_minor, shipping_minor, total_minor, expires_at
    ) values (
      'FFEU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      p_drop_id, p_idempotency_key, trim(p_customer->>'name'), normalized_email, normalized_phone,
      p_customer->>'paymentMethod', trim(p_customer->>'paymentName'), nullif(trim(p_customer->>'notes'), ''),
      p_shipping, drop_row.currency, subtotal, drop_row.shipping_amount_minor,
      subtotal + drop_row.shipping_amount_minor, now() + interval '48 hours'
    ) returning * into created_order;
  exception when unique_violation then
    select * into existing_order from public.orders where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'id', existing_order.id, 'reference', existing_order.reference,
        'status', existing_order.status, 'expiresAt', existing_order.expires_at,
        'currency', existing_order.currency, 'subtotalMinor', existing_order.subtotal_minor,
        'shippingMinor', existing_order.shipping_minor, 'totalMinor', existing_order.total_minor,
        'paymentInstructions', drop_row.payment_instructions
      );
    end if;
    raise exception 'active_reservation_exists';
  end;

  for requested in select value from jsonb_array_elements(p_items)
  loop
    quantity := (requested->>'quantity')::integer;
    select * into item_row from public.drop_items where id = requested->>'itemId';
    update public.drop_items set stock_available = stock_available - quantity, updated_at = now()
      where id = item_row.id;
    insert into public.order_items (
      order_id, drop_item_id, sku, name, item_type, artist, image_path, quantity,
      unit_amount_minor, line_total_minor, currency, shipping_amount_minor, shipping_address
    ) values (
      created_order.id, item_row.id, item_row.sku, item_row.name, item_row.item_type,
      item_row.artist, item_row.image_path, quantity, item_row.amount_minor,
      item_row.amount_minor * quantity, drop_row.currency, drop_row.shipping_amount_minor, p_shipping
    );
  end loop;

  insert into public.order_events(order_id, event_type, to_status, metadata)
    values (created_order.id, 'reservation_created', 'awaiting_payment', jsonb_build_object('expiresAt', created_order.expires_at));
  insert into public.notification_outbox(order_id, template_key)
    values (created_order.id, 'reservation');

  return jsonb_build_object(
    'id', created_order.id, 'reference', created_order.reference,
    'status', created_order.status, 'expiresAt', created_order.expires_at,
    'currency', created_order.currency, 'subtotalMinor', created_order.subtotal_minor,
    'shippingMinor', created_order.shipping_minor, 'totalMinor', created_order.total_minor,
    'paymentInstructions', drop_row.payment_instructions
  );
end;
$$;

create or replace function public.release_order_inventory(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare line public.order_items%rowtype;
begin
  if (select inventory_released_at from public.orders where id = p_order_id for update) is not null then return; end if;
  for line in select * from public.order_items where order_id = p_order_id
  loop
    update public.drop_items set stock_available = least(stock_total, stock_available + line.quantity), updated_at = now()
      where id = line.drop_item_id;
  end loop;
  update public.orders set inventory_released_at = now() where id = p_order_id;
end;
$$;

create or replace function public.admin_update_order(
  p_order_id uuid,
  p_action text,
  p_expected_version integer,
  p_actor_email text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  previous_status public.order_status;
  next_status public.order_status;
  event_name text := p_action;
  email_template text;
  note_text text := nullif(trim(p_payload->>'note'), '');
begin
  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if current_order.version <> p_expected_version then raise exception 'version_conflict'; end if;
  previous_status := current_order.status;
  next_status := current_order.status;

  case p_action
    when 'mark_paid' then
      if current_order.status <> 'awaiting_payment' or current_order.expires_at <= now() then raise exception 'transition_invalid'; end if;
      next_status := 'paid'; email_template := 'paid';
      update public.orders set paid_at = now() where id = p_order_id;
    when 'mark_awaiting_shipment' then
      if current_order.status <> 'paid' then raise exception 'transition_invalid'; end if;
      next_status := 'awaiting_shipment'; email_template := 'awaiting_shipment';
      update public.orders set awaiting_shipment_at = now() where id = p_order_id;
    when 'mark_shipped' then
      if current_order.status <> 'awaiting_shipment' then raise exception 'transition_invalid'; end if;
      next_status := 'shipped'; email_template := 'shipped';
      update public.orders set shipped_at = now(),
        tracking_carrier = case when p_payload ? 'trackingCarrier' then nullif(trim(p_payload->>'trackingCarrier'), '') else tracking_carrier end,
        tracking_number = case when p_payload ? 'trackingNumber' then nullif(trim(p_payload->>'trackingNumber'), '') else tracking_number end,
        tracking_url = case when p_payload ? 'trackingUrl' then nullif(trim(p_payload->>'trackingUrl'), '') else tracking_url end where id = p_order_id;
    when 'cancel' then
      if current_order.status in ('shipped', 'cancelled', 'expired') or note_text is null then raise exception 'transition_invalid'; end if;
      perform public.release_order_inventory(p_order_id);
      next_status := 'cancelled'; email_template := 'cancelled';
      update public.orders set cancelled_at = now() where id = p_order_id;
    when 'update_tracking' then
      if current_order.status in ('cancelled', 'expired') then raise exception 'transition_invalid'; end if;
      update public.orders set
        tracking_carrier = nullif(trim(p_payload->>'trackingCarrier'), ''),
        tracking_number = nullif(trim(p_payload->>'trackingNumber'), ''),
        tracking_url = nullif(trim(p_payload->>'trackingUrl'), '') where id = p_order_id;
    when 'add_note' then
      if note_text is null then raise exception 'note_required'; end if;
      update public.orders set internal_notes = concat_ws(E'\n', internal_notes, note_text) where id = p_order_id;
    when 'retry_email' then
      email_template := case current_order.status::text
        when 'awaiting_payment' then 'reservation' else current_order.status::text end;
    when 'anonymize' then
      if current_order.status not in ('shipped', 'cancelled', 'expired') then raise exception 'terminal_order_required'; end if;
      update public.orders set customer_name = null, customer_email = null, customer_phone = null,
        payment_name = null, customer_notes = null, shipping_address = null, anonymized_at = now()
        where id = p_order_id;
    else raise exception 'action_invalid';
  end case;

  update public.orders set status = next_status, version = version + 1, updated_at = now() where id = p_order_id;
  insert into public.order_events(order_id, event_type, from_status, to_status, actor_email, note, metadata)
    values (p_order_id, event_name, previous_status, next_status, lower(p_actor_email), note_text, p_payload - 'note');
  if email_template is not null then
    insert into public.notification_outbox(order_id, template_key) values (p_order_id, email_template);
  end if;
  select * into current_order from public.orders where id = p_order_id;
  return to_jsonb(current_order);
end;
$$;

create or replace function public.expire_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  expired_count integer := 0;
begin
  for target in
    select id from public.orders
    where status = 'awaiting_payment' and expires_at <= now()
    for update skip locked
  loop
    perform public.release_order_inventory(target.id);
    update public.orders set status = 'expired', version = version + 1, updated_at = now() where id = target.id;
    insert into public.order_events(order_id, event_type, from_status, to_status)
      values (target.id, 'expired', 'awaiting_payment', 'expired');
    insert into public.notification_outbox(order_id, template_key) values (target.id, 'expired');
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;

create or replace function public.claim_notification_outbox(p_limit integer default 20)
returns setof public.notification_outbox
language sql
security definer
set search_path = public
as $$
  update public.notification_outbox
  set locked_at = now(), attempts = attempts + 1
  where id in (
    select id from public.notification_outbox
    where sent_at is null and attempts < 8 and (locked_at is null or locked_at < now() - interval '10 minutes')
    order by created_at for update skip locked limit greatest(1, least(p_limit, 100))
  )
  returning *;
$$;

create or replace function public.finish_notification(p_id bigint, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notification_outbox set
    sent_at = case when p_error is null then now() else sent_at end,
    last_error = left(p_error, 500), locked_at = null
  where id = p_id;
$$;

revoke all on function public.sync_drop_catalog(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.create_reservation(text, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.release_order_inventory(uuid) from public, anon, authenticated;
revoke all on function public.admin_update_order(uuid, text, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.expire_reservations() from public, anon, authenticated;
revoke all on function public.claim_notification_outbox(integer) from public, anon, authenticated;
revoke all on function public.finish_notification(bigint, text) from public, anon, authenticated;

grant execute on function public.sync_drop_catalog(jsonb, jsonb) to service_role;
grant execute on function public.create_reservation(text, jsonb, jsonb, jsonb, uuid) to service_role;
grant execute on function public.admin_update_order(uuid, text, integer, text, jsonb) to service_role;
grant execute on function public.expire_reservations() to service_role;
grant execute on function public.claim_notification_outbox(integer) to service_role;
grant execute on function public.finish_notification(bigint, text) to service_role;
