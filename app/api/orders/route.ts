import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

type OrderItem = {
  id: number;
  name: string;
  quantity: number;
  price: number;
};

function asNumber(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeItems(value: unknown): OrderItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];

    const orderItem = item as Record<string, unknown>;
    const id = asNumber(orderItem.id, 0);
    const quantity = asNumber(orderItem.quantity, 0);
    const price = asNumber(orderItem.price, 0);
    const name = typeof orderItem.name === "string" ? orderItem.name.trim() : "";

    if (!id || !quantity || !price || !name) return [];

    return [{ id, name, quantity, price }];
  });
}

async function sendTelegramMessage(order: {
  id: string;
  total: number;
  subtotal: number;
  delivery: number;
  items: OrderItem[];
  lang: string;
}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.info("Telegram notifications are disabled. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.");
    return;
  }

  const summary = order.items
    .map((item) => `${item.name} × ${item.quantity} — ${item.price * item.quantity} ₸`)
    .join("\n");

  const text = [
    "🧾 Новый заказ",
    `ID: ${order.id}`,
    `Язык: ${order.lang}`,
    `Подытог: ${order.subtotal} ₸`,
    `Доставка: ${order.delivery} ₸`,
    `Итого: ${order.total} ₸`,
    "",
    "Товары:",
    summary,
  ].join("\n");

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      chat_id: chatId,
      text,
    }).toString(),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    console.error("Telegram sendMessage failed", payload ?? response.statusText);
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const items = normalizeItems(data.items);
  const subtotal = asNumber(data.subtotal, 0);
  const delivery = asNumber(data.delivery, 0);
  const total = asNumber(data.total, subtotal + delivery);
  const lang = typeof data.lang === "string" && (data.lang === "ru" || data.lang === "kk") ? data.lang : "ru";

  if (!items.length) {
    return NextResponse.json({ error: "EMPTY_ORDER" }, { status: 400 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 500 });
  }

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert([
      {
        status: "new",
        source: "mini_app",
        lang,
        subtotal,
        delivery,
        total,
        items,
        customer_name: typeof data.customerName === "string" ? data.customerName : null,
        phone: typeof data.phone === "string" ? data.phone : null,
        notes: typeof data.notes === "string" ? data.notes : null,
      },
    ])
    .select()
    .single();

  if (error || !order) {
    console.error("Supabase insert failed", error);
    return NextResponse.json({ error: "ORDER_SAVE_FAILED" }, { status: 500 });
  }

  await sendTelegramMessage({
    id: order.id,
    total: order.total,
    subtotal: order.subtotal,
    delivery: order.delivery,
    items: Array.isArray(order.items) ? (order.items as OrderItem[]) : items,
    lang,
  });

  return NextResponse.json({
    ok: true,
    message: "ORDER_SAVED",
    order: {
      id: order.id,
      total: order.total,
      subtotal: order.subtotal,
      delivery: order.delivery,
      items: Array.isArray(order.items) ? order.items : items,
    },
  });
}
