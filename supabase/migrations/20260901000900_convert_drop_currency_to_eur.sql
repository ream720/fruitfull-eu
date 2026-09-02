-- The EU shop launches in EUR. Refuse to relabel any historical USD records;
-- this migration is intended to run before the first catalogue is synchronized.
do $$
begin
  if exists (select 1 from public.drops where currency <> 'EUR')
    or exists (select 1 from public.orders where currency <> 'EUR')
    or exists (select 1 from public.order_items where currency <> 'EUR') then
    raise exception 'cannot_convert_existing_non_eur_orders';
  end if;
end;
$$;

alter table public.drops drop constraint if exists drops_currency_check;
alter table public.drops
  add constraint drops_currency_check check (currency = 'EUR');

alter table public.orders drop constraint if exists orders_currency_check;
alter table public.orders
  add constraint orders_currency_check check (currency = 'EUR');

alter table public.order_items drop constraint if exists order_items_currency_check;
alter table public.order_items
  add constraint order_items_currency_check check (currency = 'EUR');

alter table public.drop_items
  add column if not exists secondary_image_path text;

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
  if upper(p_drop->>'currency') <> 'EUR' then raise exception 'currency_must_be_eur'; end if;
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
        artist = item->>'artist', image_path = item->>'image',
        secondary_image_path = nullif(item->>'secondaryImage', ''), description = item->>'description',
        amount_minor = (item->>'amountMinor')::integer, stock_total = new_total,
        stock_available = new_total - consumed, max_per_order = (item->>'maxPerOrder')::integer,
        active = coalesce((item->>'active')::boolean, false), updated_at = now()
      where id = item->>'id';
    else
      insert into public.drop_items (
        id, drop_id, sku, name, item_type, artist, image_path, secondary_image_path, description,
        amount_minor, stock_total, stock_available, max_per_order, active
      ) values (
        item->>'id', p_drop->>'id', item->>'sku', item->>'name', item->>'type',
        item->>'artist', item->>'image', nullif(item->>'secondaryImage', ''),
        item->>'description', (item->>'amountMinor')::integer,
        new_total, new_total, (item->>'maxPerOrder')::integer,
        coalesce((item->>'active')::boolean, false)
      );
    end if;
  end loop;
  return jsonb_build_object('id', p_drop->>'id', 'syncedItems', jsonb_array_length(p_items));
end;
$$;
