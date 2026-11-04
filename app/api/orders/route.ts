import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { PRODUCT_PRICES } from "../../../lib/order-catalog";
import { isBusinessOpen } from "../../../lib/business-hours";
import ru from "../../translations/ru.json";
import kk from "../../translations/kk.json";

type OrderItem = {
  id: number;
  name: string;
  quantity: number;
  price: number;
};

async function verifyTurnstileToken(
  token: string,
): Promise<"valid" | "invalid" | "unavailable" | "not_configured"> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return "not_configured";

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, response: token }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) {
      console.error("Turnstile verification request failed", response.status);
      return "unavailable";
    }

    const result: unknown = await response.json();
    if (
      result &&
      typeof result === "object" &&
      "success" in result &&
      result.success === true &&
      "action" in result &&
      result.action === "order"
    ) {
      return "valid";
    }
    return "invalid";
  } catch (error) {
    console.error("Turnstile verification could not be completed", error);
    return "unavailable";
  }
}

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

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  return null;
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
  notes: string;
  deliveryMethod: "delivery" | "pickup";
  items: OrderItem[];
}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.info("Telegram notifications are disabled. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.");
    return;
  }

  const summary = order.items
    .map(
      (item) =>
        `${ru.products[item.id - 1].name} × ${item.quantity} — ${item.price * item.quantity} ₸`,
    )
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
    ...(order.notes ? [`Комментарий: ${order.notes}`] : []),
    `Подытог: ${order.subtotal} ₸`,
    `Доставка: ${order.delivery} ₸`,
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
  if (!isBusinessOpen()) {
    return NextResponse.json({ error: "BUSINESS_CLOSED" }, { status: 403 });
  }

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
  const rawPhone = typeof data.phone === "string" ? data.phone.trim() : "";
  const phone = normalizePhone(data.phone);
  const turnstileToken = data.turnstileToken;
  const address = normalizeAddress(data.address);
  if (data.deliveryMethod !== "delivery" && data.deliveryMethod !== "pickup") {
    return NextResponse.json({ error: "INVALID_DELIVERY_METHOD" }, { status: 400 });
  }
  const deliveryMethod = normalizeDeliveryMethod(data.deliveryMethod);
  const notes = typeof data.notes === "string" ? data.notes.trim() : "";

  if (!items) {
    return NextResponse.json({ error: "INVALID_ITEMS" }, { status: 400 });
  }

  if (!rawPhone) {
    return NextResponse.json({ error: "PHONE_REQUIRED" }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: "PHONE_INVALID" }, { status: 400 });
  }

  if (deliveryMethod === "delivery" && (!address || address.length > 500)) {
    return NextResponse.json({ error: "ADDRESS_REQUIRED" }, { status: 400 });
  }

  if (notes.length > 1000) {
    return NextResponse.json({ error: "NOTES_TOO_LONG" }, { status: 400 });
  }

  if (
    typeof turnstileToken !== "string" ||
    turnstileToken.length === 0 ||
    turnstileToken.length > 2048
  ) {
    return NextResponse.json({ error: "TURNSTILE_INVALID" }, { status: 400 });
  }

  const turnstileResult = await verifyTurnstileToken(turnstileToken);
  if (turnstileResult !== "valid") {
    const status = turnstileResult === "invalid" ? 400 : 503;
    const error =
      turnstileResult === "invalid"
        ? "TURNSTILE_INVALID"
        : turnstileResult === "not_configured"
          ? "TURNSTILE_NOT_CONFIGURED"
          : "TURNSTILE_UNAVAILABLE";
    return NextResponse.json({ error }, { status });
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
    notes: order.notes ?? notes,
    deliveryMethod: (order.delivery_method as "delivery" | "pickup") ?? deliveryMethod,
    items: Array.isArray(order.items) ? (order.items as OrderItem[]) : items,
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
