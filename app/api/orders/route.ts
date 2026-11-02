import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { PRODUCT_PRICES } from "../../../lib/order-catalog";
import ru from "../../translations/ru.json";
import kk from "../../translations/kk.json";

type OrderItem = {
  id: number;
  name: string;
  quantity: number;
  price: number;
};

function normalizeItems(value: unknown, lang: "ru" | "kk"): OrderItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null;

  const seenIds = new Set<number>();
  const catalog = lang === "ru" ? ru.products : kk.products;
  const items: OrderItem[] = [];

  for (const itemValue of value) {
    if (!itemValue || typeof itemValue !== "object" || Array.isArray(itemValue)) return null;

    const item = itemValue as Record<string, unknown>;
    const id = item.id;
    const quantity = item.quantity;
    if (
      typeof id !== "number" ||
      !Number.isSafeInteger(id) ||
      !(id in PRODUCT_PRICES) ||
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 99 ||
      seenIds.has(id)
    ) {
      return null;
    }

    seenIds.add(id);
    items.push({
      id,
      name: catalog[id - 1].name,
      quantity,
      price: PRODUCT_PRICES[id],
    });
  }

  return items;
}

function normalizePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeAddress(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeDeliveryMethod(value: unknown): "delivery" | "pickup" {
  return value === "pickup" ? "pickup" : "delivery";
}

async function sendTelegramMessage(order: {
  total: number;
  subtotal: number;
  delivery: number;
  phone: string;
  address: string;
  deliveryMethod: "delivery" | "pickup";
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

  const deliveryLabel = order.deliveryMethod === "pickup" ? "Самовывоз" : "Доставка";
  const addressLine = order.address ? `Адрес: ${order.address}` : "Адрес: не указан";

  const text = [
    "📦 Новый заказ",
    `Телефон: ${order.phone || "не указан"}`,
    `Заказ: ${summary || "—"}`,
    `Сумма: ${order.total} ₸`,
    `Способ доставки: ${deliveryLabel}`,
    addressLine,
    `Подытог: ${order.subtotal} ₸`,
    `Доставка: ${order.delivery} ₸`,
    `Язык: ${order.lang}`,
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

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const lang = data.lang === "kk" ? "kk" : "ru";
  const items = normalizeItems(data.items, lang);
  const phone = normalizePhone(data.phone);
  const address = normalizeAddress(data.address);
  if (data.deliveryMethod !== "delivery" && data.deliveryMethod !== "pickup") {
    return NextResponse.json({ error: "INVALID_DELIVERY_METHOD" }, { status: 400 });
  }
  const deliveryMethod = normalizeDeliveryMethod(data.deliveryMethod);
  const notes = typeof data.notes === "string" ? data.notes.trim() : "";

  if (!items) {
    return NextResponse.json({ error: "INVALID_ITEMS" }, { status: 400 });
  }

  if (!phone || phone.length > 40) {
    return NextResponse.json({ error: "PHONE_REQUIRED" }, { status: 400 });
  }

  if (deliveryMethod === "delivery" && (!address || address.length > 500)) {
    return NextResponse.json({ error: "ADDRESS_REQUIRED" }, { status: 400 });
  }

  if (notes.length > 1000) {
    return NextResponse.json({ error: "NOTES_TOO_LONG" }, { status: 400 });
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const delivery = subtotal >= 5000 || subtotal === 0 ? 0 : 500;
  const total = subtotal + delivery;

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
        phone,
        address: deliveryMethod === "delivery" ? address : null,
        delivery_method: deliveryMethod,
        notes: notes || null,
      },
    ])
    .select()
    .single();

  if (error || !order) {
    console.error("Supabase insert failed", error);
    return NextResponse.json({ error: "ORDER_SAVE_FAILED" }, { status: 500 });
  }

  await sendTelegramMessage({
    total: order.total,
    subtotal: order.subtotal,
    delivery: order.delivery,
    phone: order.phone ?? phone,
    address: order.address ?? address,
    deliveryMethod: (order.delivery_method as "delivery" | "pickup") ?? deliveryMethod,
    items: Array.isArray(order.items) ? (order.items as OrderItem[]) : items,
    lang,
  });

  return NextResponse.json({
    ok: true,
    message: "ORDER_SAVED",
    order: {
      total: order.total,
      subtotal: order.subtotal,
      delivery: order.delivery,
      phone: order.phone ?? phone,
      address: order.address ?? address,
      deliveryMethod: (order.delivery_method as "delivery" | "pickup") ?? deliveryMethod,
      items: Array.isArray(order.items) ? order.items : items,
    },
  });
}
