"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import {
  ArrowRight,
  Clock3,
  Flame,
  Leaf,
  LoaderCircle,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import ru from "./translations/ru.json";
import kk from "./translations/kk.json";
import AiChat from "./components/ai-chat";
import { PRODUCT_PRICES } from "../lib/order-catalog";
import { isBusinessOpen } from "../lib/business-hours";

const translations = { ru, kk };
type Lang = keyof typeof translations;
type Category = "all" | "popular" | "burgers" | "dishes" | "snacks" | "drinks";
type Product = {
  id: number;
  price: number;
  image: string;
  category: Exclude<Category, "all" | "popular">;
  popular?: boolean;
  spicy?: boolean;
  vegetarian?: boolean;
};

type DeliveryMethod = "delivery" | "pickup";
type SubmittedOrder = {
  items: Array<{ id: number; name: string; quantity: number; price: number }>;
  total: number;
};

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      size: "invisible";
      execution: "execute";
      appearance: "execute";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
    },
  ) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const maxReceiptSize = 4 * 1024 * 1024;
const productData: Omit<Product, "price">[] = [
  { id: 1, image: "🍔", category: "burgers", popular: true },
  { id: 2, image: "🍜", category: "dishes", popular: true },
  { id: 3, image: "🍗", category: "dishes", spicy: true },
  { id: 4, image: "🥯", category: "snacks", vegetarian: true },
  { id: 5, image: "🍟", category: "snacks", vegetarian: true },
  { id: 6, image: "🥛", category: "drinks" },
  { id: 7, image: "🍔", category: "burgers", spicy: true },
  { id: 8, image: "🍓", category: "drinks", vegetarian: true },
];
const catKeys: Category[] = ["all", "popular", "burgers", "dishes", "snacks", "drinks"];
const icons: Record<Category, string> = {
  all: "✳",
  popular: "✦",
  burgers: "🍔",
  dishes: "🍲",
  snacks: "🥟",
  drinks: "🥤",
};

export default function Home() {
  const [lang, setLang] = useState<Lang>("ru");
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [orderedDeliveryMethod, setOrderedDeliveryMethod] =
    useState<DeliveryMethod>("delivery");
  const [submittedOrder, setSubmittedOrder] = useState<SubmittedOrder | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("delivery");
  const [businessOpen, setBusinessOpen] = useState<boolean | null>(null);
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  const [turnstileWidgetReady, setTurnstileWidgetReady] = useState(false);
  const [turnstileError, setTurnstileError] = useState(false);
  const [isVerifyingTurnstile, setIsVerifyingTurnstile] = useState(false);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const turnstileWidgetRef = useRef<string | null>(null);
  const turnstileResultRef = useRef<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const t = translations[lang];
  const otherLanguage: Lang = lang === "ru" ? "kk" : "ru";
  const otherProducts = translations[otherLanguage].products;
  const products = useMemo(
    () =>
      productData.map((product, index) => ({
        ...product,
        price: PRODUCT_PRICES[product.id],
        ...t.products[index],
      })),
    [t],
  );
  const cartCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  const subtotal = products.reduce(
    (sum, product) => sum + product.price * (cart[product.id] ?? 0),
    0,
  );
  const delivery =
    deliveryMethod === "delivery" && subtotal > 0 && subtotal < 5000 ? 500 : 0;
  useEffect(() => {
    const updateBusinessHours = () => setBusinessOpen(isBusinessOpen());
    updateBusinessHours();
    const interval = window.setInterval(updateBusinessHours, 15_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (
      !turnstileScriptReady ||
      !turnstileSiteKey ||
      !turnstileContainerRef.current ||
      !window.turnstile
    ) {
      return;
    }

    try {
      const widgetId = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: turnstileSiteKey,
        action: "order",
        size: "invisible",
        execution: "execute",
        appearance: "execute",
        callback: (token) => {
          turnstileResultRef.current?.resolve(token);
          turnstileResultRef.current = null;
        },
        "error-callback": () => {
          setTurnstileError(true);
          turnstileResultRef.current?.reject(new Error("TURNSTILE_UNAVAILABLE"));
          turnstileResultRef.current = null;
        },
        "expired-callback": () => {
          turnstileResultRef.current?.reject(new Error("TURNSTILE_INVALID"));
          turnstileResultRef.current = null;
        },
      });
      turnstileWidgetRef.current = widgetId;
      setTurnstileWidgetReady(true);
      setTurnstileError(false);
    } catch (error) {
      console.error("Turnstile widget could not be initialized", error);
      setTurnstileError(true);
    }

    return () => {
      const widgetId = turnstileWidgetRef.current;
      if (widgetId) window.turnstile?.remove(widgetId);
      turnstileResultRef.current?.reject(new Error("TURNSTILE_UNAVAILABLE"));
      turnstileResultRef.current = null;
      turnstileWidgetRef.current = null;
      setTurnstileWidgetReady(false);
    };
  }, [turnstileScriptReady]);

  const requestTurnstileToken = () =>
    new Promise<string>((resolve, reject) => {
      const turnstile = window.turnstile;
      const widgetId = turnstileWidgetRef.current;
      if (!turnstileScriptReady || !turnstile || !widgetId) {
        reject(new Error("TURNSTILE_UNAVAILABLE"));
        return;
      }

      let settled = false;
      let timeoutId: number;
      const finish = () => {
        if (settled) return false;
        settled = true;
        window.clearTimeout(timeoutId);
        turnstileResultRef.current = null;
        return true;
      };
      const succeed = (token: string) => {
        if (finish()) resolve(token);
      };
      const fail = (error: Error) => {
        if (finish()) reject(error);
      };
      turnstileResultRef.current = { resolve: succeed, reject: fail };
      timeoutId = window.setTimeout(() => {
        setTurnstileError(true);
        fail(new Error("TURNSTILE_UNAVAILABLE"));
      }, 20_000);
      setTurnstileError(false);
      try {
        turnstile.execute(widgetId);
      } catch (error) {
        fail(new Error("TURNSTILE_UNAVAILABLE"));
        console.error("Turnstile challenge could not start", error);
      }
    });

  const money = (amount: number) =>
    `${amount.toLocaleString(lang === "ru" ? "ru-RU" : "kk-KZ")} ₸`;
  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          (category === "all" ||
            (category === "popular" ? product.popular : product.category === category)) &&
          `${product.name} ${product.description} ${otherProducts[product.id - 1].name} ${otherProducts[product.id - 1].description}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
      ),
    [category, otherProducts, products, query],
  );
  const add = (id: number, quantity = 1) => {
    setOrdered(false);
    setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + quantity }));
  };
  const addChatItems = (items: { productId: number; quantity: number }[]) => {
    setCart((current) => {
      const next = { ...current };
      for (const item of items) {
        next[item.productId] = (next[item.productId] ?? 0) + item.quantity;
      }
      return next;
    });
    setOrdered(false);
    setCartOpen(true);
  };
  const change = (id: number, amount: number) => {
    setOrdered(false);
    setCart((current) => {
      const quantity = (current[id] ?? 0) + amount;
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    });
  };
  const categoryName = (key: Category) => ({
    all: t.all,
    popular: t.popular,
    burgers: t.burgers,
    dishes: t.dishes,
    snacks: t.snacks,
    drinks: t.drinks,
  })[key];

  const submitOrder = async () => {
    if (!cartCount || isSubmittingOrder) return;
    if (businessOpen !== true) {
      alert(t.closedOrderMessage);
      return;
    }
    if (!turnstileSiteKey) {
      alert(t.turnstileNotConfigured);
      return;
    }
    if (!phone.trim()) {
      alert(lang === "ru" ? "Укажите номер телефона." : "Телефон нөмірін көрсетіңіз.");
      return;
    }
    const normalizedPhone = normalizeKazakhstanPhone(phone);
    if (!normalizedPhone) {
      alert(t.phoneInvalid);
      return;
    }
    if (deliveryMethod === "delivery" && !address.trim()) {
      alert(lang === "ru" ? "Укажите адрес доставки." : "Жеткізу адресін көрсетіңіз.");
      return;
    }
    if (!receipt) {
      alert(t.receiptRequired);
      return;
    }
    if (
      !receipt.name.toLowerCase().endsWith(".pdf") ||
      (receipt.type && receipt.type !== "application/pdf") ||
      receipt.size === 0
    ) {
      alert(t.receiptInvalid);
      return;
    }
    if (receipt.size > maxReceiptSize) {
      alert(t.receiptTooLarge);
      return;
    }

    const items = products
      .filter((product) => cart[product.id])
      .map((product) => ({
        id: product.id,
        quantity: cart[product.id] ?? 0,
      }));

    setIsSubmittingOrder(true);

    try {
      setIsVerifyingTurnstile(true);
      const token = await requestTurnstileToken();
      setIsVerifyingTurnstile(false);
      const formData = new FormData();
      formData.append(
        "order",
        JSON.stringify({
          lang,
          items,
          phone: normalizedPhone,
          address: deliveryMethod === "delivery" ? address : "",
          deliveryMethod,
          notes,
          turnstileToken: token,
        }),
      );
      formData.append("receipt", receipt, receipt.name);
      const response = await fetch("/api/orders", {
        method: "POST",
        body: formData,
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "ORDER_FAILED");
      }

      setSubmittedOrder({
        items: items.map(({ id, quantity }) => {
          const product = products[id - 1];
          return {
            id,
            name: product.name,
            quantity,
            price: product.price,
          };
        }),
        total: subtotal + delivery,
      });
      setCart({});
      setPhone("");
      setAddress("");
      setNotes("");
      setReceipt(null);
      if (receiptInputRef.current) receiptInputRef.current.value = "";
      setOrderedDeliveryMethod(deliveryMethod);
      setDeliveryMethod("delivery");
      setOrdered(true);
    } catch (error) {
      console.error("Order submit failed", error);
      setOrdered(false);
      const code = error instanceof Error ? error.message : "ORDER_FAILED";
      const errorMessages: Record<string, string> = {
        BUSINESS_CLOSED: t.closedOrderMessage,
        TURNSTILE_INVALID: t.turnstileInvalid,
        TURNSTILE_UNAVAILABLE: t.turnstileUnavailable,
        TURNSTILE_NOT_CONFIGURED: t.turnstileNotConfigured,
        RECEIPT_REQUIRED: t.receiptRequired,
        RECEIPT_INVALID: t.receiptInvalid,
        RECEIPT_SIZE_INVALID: t.receiptTooLarge,
        RECEIPT_DELIVERY_FAILED: t.receiptTelegramUnavailable,
        TELEGRAM_NOT_CONFIGURED: t.receiptTelegramUnavailable,
      };
      alert(
        errorMessages[code] ??
          (lang === "ru"
            ? "Не удалось сохранить заказ. Проверьте настройки Supabase и Telegram."
            : "Тапсырыс сақталмады. Supabase және Telegram конфигурациясын тексеріңіз."),
      );
    } finally {
      setIsVerifyingTurnstile(false);
      const widgetId = turnstileWidgetRef.current;
      if (widgetId) window.turnstile?.reset(widgetId);
      setIsSubmittingOrder(false);
    }
  };

  return (
    <main className="app-shell">
      {turnstileSiteKey && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setTurnstileScriptReady(true)}
          onError={() => {
            setTurnstileScriptReady(false);
            setTurnstileError(true);
          }}
        />
      )}
      {turnstileSiteKey && (
        <div
          ref={turnstileContainerRef}
          className="turnstile-invisible-widget"
          aria-hidden="true"
        />
      )}
      <header className="topbar">
        <a className="brand" href="#top" aria-label="DALA">
          <span className="brand-mark">
            D<span>.</span>
          </span>
          <span className="brand-word">
            DALA<small>{t.brandSubtitle}</small>
          </span>
        </a>
        <div className="topbar-center">
          <span className={`open-dot${businessOpen === false ? " is-closed" : ""}`} />
          {businessOpen === false ? t.closedStatus : t.openStatus}
        </div>
        <div className="topbar-actions">
          <div className="lang-toggle" aria-label={t.language}>
            <button
              className={lang === "ru" ? "active" : ""}
              onClick={() => setLang("ru")}
            >
              RU
            </button>
            <span />
            <button
              className={lang === "kk" ? "active" : ""}
              onClick={() => setLang("kk")}
            >
              ҚАЗ
            </button>
          </div>
          <button
            className="cart-button"
            onClick={() => {
              setCartOpen(true);
            }}
          >
            <ShoppingBag size={17} />
            <span>{t.cart}</span>
            {cartCount > 0 && <b>{cartCount}</b>}
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-left">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            {t.eyebrow}
          </div>
          <h1>
            {t.headline}
            <br />
            <em>{t.headlineEm}</em>
          </h1>
          <p className="hero-copy">{t.subtitle}</p>
          <button
            className="hero-cta"
            onClick={() => document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" })}
          >
            {t.select}
            <ArrowRight size={16} />
          </button>
          <div className="hero-meta">
            <span>
              <Clock3 size={15} />
              {t.deliveryTime}
            </span>
            <i />
            <span>
              <MapPin size={15} />
              {t.deliveryArea}
            </span>
          </div>
        </div>
        <div className="hero-art" aria-label={t.heroArtAlt}>
          <div className="art-sun" />
          <span className="art-spark spark-a">✳</span>
          <span className="art-spark spark-b">✦</span>
          <div className="art-caption">
            {t.artCaptionFirst}
            <br />
            {t.artCaptionSecond} <span>↗</span>
          </div>
          <div className="hero-food">🍔</div>
          <div className="hero-fries">🍟</div>
          <div className="art-sticker">
            <span>100%</span>
            <small>
              {t.halal}
              <br />
              {t.halalTagline}
            </small>
          </div>
          <div className="art-shadow" />
        </div>
        <div className="hero-side-note">{t.heroSideNote}</div>
      </section>

      <div className="promo-strip">
        <div>
          <Sparkles size={15} />
          <span>{t.promo}</span>
        </div>
        <span className="promo-right">
          {t.promoSecondary} <b>✳</b>
        </span>
      </div>

      <section className="menu-section" id="menu">
        <div className="section-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              {t.menu} / 01
            </div>
            <h2>
              {t.menuHeading} <em>{t.menuHeadingEm}</em>
            </h2>
          </div>
          <label className="search-box">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.search}
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label={t.clearSearch}>
                <X size={15} />
              </button>
            )}
          </label>
        </div>

        <div className="menu-toolbar">
          <div className="category-tabs">
            {catKeys.map((key) => (
              <button
                key={key}
                className={category === key ? "selected" : ""}
                onClick={() => setCategory(key)}
              >
                <span>{icons[key]}</span>
                {categoryName(key)}
              </button>
            ))}
          </div>
          <span className="items-count">
            {String(filtered.length).padStart(2, "0")} {t.itemsCount}
          </span>
        </div>

        {filtered.length ? (
          <div className="product-grid">
            {filtered.map((product, index) => (
              <article
                className="product-card"
                key={product.id}
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <div className={`product-art art-${product.category}`}>
                  <span className="product-emoji">{product.image}</span>
                  {product.tag && <span className="product-tag">{product.tag}</span>}
                  <span className="product-index">{String(product.id).padStart(2, "0")}</span>
                  {product.vegetarian && (
                    <span className="diet-icon">
                      <Leaf size={13} />
                    </span>
                  )}
                  {product.spicy && (
                    <span className="spicy-icon">
                      <Flame size={13} />
                    </span>
                  )}
                </div>
                <div className="product-info">
                  <div className="product-title-row">
                    <h3>{product.name}</h3>
                    <strong>{money(product.price)}</strong>
                  </div>
                  <p>{product.description}</p>
                  <div className="product-actions">
                    {cart[product.id] ? (
                      <div className="quantity">
                        <button
                          aria-label={t.decrease}
                          onClick={() => change(product.id, -1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span>{cart[product.id]}</span>
                        <button
                          aria-label={t.increase}
                          onClick={() => add(product.id)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : (
                      <button className="add-button" onClick={() => add(product.id)}>
                        {t.add}
                        <Plus size={15} />
                      </button>
                    )}
                    <span className="product-kind">{categoryName(product.category)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-search">
            <span>🔎</span>
            <h3>{t.noResults}</h3>
            <p>{t.more}</p>
          </div>
        )}
      </section>

      <footer className="footer">
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark">
            D<span>.</span>
          </span>
          <span className="brand-word">
            DALA<small>{t.brandSubtitle}</small>
          </span>
        </a>
        <span>
          {t.note} <b>♥</b>
        </span>
        <span>{t.copyright}</span>
      </footer>

      {cartOpen && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (
              !isSubmittingOrder &&
              event.target === event.currentTarget
            ) {
              setCartOpen(false);
            }
          }}
        >
          <aside className="cart-panel">
            <div className="cart-head">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-line" />
                  {t.deliveryBrand}
                </div>
                <h2>
                  {ordered ? t.orderReady : t.cart}
                  <span>{!ordered && cartCount > 0 ? ` · ${cartCount}` : ""}</span>
                </h2>
              </div>
              <button
                className="close-button"
                disabled={isSubmittingOrder}
                onClick={() => setCartOpen(false)}
                aria-label={t.closeLabel}
              >
                <X size={19} />
              </button>
            </div>

            {ordered ? (
              <div className="order-success">
                <div className="order-pending-clock" aria-hidden="true">
                  <Clock3 size={28} />
                </div>
                <h3>{t.orderReady}</h3>
                <p className="order-preparing">{t.orderPreparing}</p>
                <p>
                  {orderedDeliveryMethod === "delivery"
                    ? t.orderHintDelivery
                    : t.orderHintPickup}
                </p>
                {submittedOrder && (
                  <div className="submitted-order">
                    {submittedOrder.items.map((item) => (
                      <div className="submitted-order-item" key={item.id}>
                        <span>
                          {item.name} × {item.quantity}
                        </span>
                        <b>{money(item.price * item.quantity)}</b>
                      </div>
                    ))}
                    <div className="submitted-order-total">
                      <span>{t.orderTotal}</span>
                      <b>{money(submittedOrder.total)}</b>
                    </div>
                  </div>
                )}
                <button
                  className="checkout-button"
                  onClick={() => {
                    setCartOpen(false);
                  }}
                >
                  {t.close}
                  <ArrowRight size={17} />
                </button>
              </div>
            ) : cartCount === 0 ? (
              <div className="cart-empty">
                <span className="empty-bag">🛍️</span>
                <h3>{t.empty}</h3>
                <p>{t.emptyHint}</p>
                <button
                  className="checkout-button"
                  onClick={() => {
                    setCartOpen(false);
                    document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  {t.select}
                  <ArrowRight size={17} />
                </button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {products
                    .filter((product) => cart[product.id])
                    .map((product) => (
                      <div className="cart-item" key={product.id}>
                        <div className="cart-item-emoji">{product.image}</div>
                        <div className="cart-item-info">
                          <strong>{product.name}</strong>
                          <span>{money(product.price)}</span>
                          <div className="quantity">
                            <button
                              aria-label={t.decrease}
                              onClick={() => change(product.id, -1)}
                            >
                              <Minus size={13} />
                            </button>
                            <span>{cart[product.id]}</span>
                            <button
                              aria-label={t.increase}
                              onClick={() => add(product.id)}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                        <b>{money(product.price * cart[product.id])}</b>
                      </div>
                    ))}
                </div>

                <div className="cart-bottom">
                  {deliveryMethod === "delivery" && (
                    <div className="delivery-progress">
                      {subtotal >= 5000 ? (
                        <>
                          <span>✦</span> {t.free} · 5 000 ₸+
                        </>
                      ) : (
                        <>
                          <span>✦</span> {t.deliveryRemaining} {money(5000 - subtotal)}
                        </>
                      )}
                      <div className="progress-track">
                        <i style={{ width: `${Math.min(100, (subtotal / 5000) * 100)}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="order-form">
                    {!turnstileSiteKey ? (
                      <p className="turnstile-message" role="alert">
                        {t.turnstileNotConfigured}
                      </p>
                    ) : null}
                    {turnstileError && (
                      <p className="turnstile-message" role="alert">
                        {t.turnstileUnavailable}
                      </p>
                    )}
                    <label className="order-field">
                      <span>{t.phoneLabel}</span>
                      <input
                        id="order-phone"
                        name="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        value={phone}
                        onChange={(event) =>
                          setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))
                        }
                        maxLength={24}
                        placeholder={t.phonePlaceholder}
                      />
                    </label>

                    <label className="order-field">
                      <span>{t.receiptLabel}</span>
                      <input
                        ref={receiptInputRef}
                        id="order-receipt"
                        name="receipt"
                        type="file"
                        accept=".pdf,application/pdf"
                        required
                        disabled={isSubmittingOrder}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          if (!file) {
                            setReceipt(null);
                            return;
                          }
                          if (
                            !file.name.toLowerCase().endsWith(".pdf") ||
                            (file.type && file.type !== "application/pdf") ||
                            file.size === 0
                          ) {
                            event.target.value = "";
                            setReceipt(null);
                            alert(t.receiptInvalid);
                            return;
                          }
                          if (file.size > maxReceiptSize) {
                            event.target.value = "";
                            setReceipt(null);
                            alert(t.receiptTooLarge);
                            return;
                          }
                          setReceipt(file);
                        }}
                      />
                      <small className="receipt-help">
                        {receipt ? receipt.name : t.receiptHelp}
                      </small>
                    </label>

                    <div className="delivery-methods">
                      <button
                        type="button"
                        className={deliveryMethod === "delivery" ? "selected" : ""}
                        onClick={() => setDeliveryMethod("delivery")}
                      >
                        {lang === "ru" ? "Доставка" : "Жеткізу"}
                      </button>
                      <button
                        type="button"
                        className={deliveryMethod === "pickup" ? "selected" : ""}
                        onClick={() => setDeliveryMethod("pickup")}
                      >
                        {lang === "ru" ? "Самовывоз" : "Өзі алу"}
                      </button>
                    </div>

                    {deliveryMethod === "delivery" && (
                      <label className="order-field">
                        <span>{t.addressLabel}</span>
                        <textarea
                          id="order-address"
                          name="address"
                          autoComplete="street-address"
                          value={address}
                          onChange={(event) => setAddress(event.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder={t.addressPlaceholder}
                        />
                      </label>
                    )}
                    <label className="order-field">
                      <span>{t.notesLabel}</span>
                      <textarea
                        id="order-notes"
                        name="order-notes"
                        autoComplete="off"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder={t.notesPlaceholder}
                      />
                    </label>
                  </div>

                  {deliveryMethod === "delivery" && (
                    <div className="price-row">
                      <span>{t.delivery}</span>
                      <b>{delivery ? money(delivery) : t.free}</b>
                    </div>
                  )}
                  <div className="price-total">
                    <span>{t.total}</span>
                    <b>{money(subtotal + delivery)}</b>
                  </div>
                  <button
                    className="checkout-button"
                    onClick={submitOrder}
                    disabled={
                      isSubmittingOrder ||
                      businessOpen !== true ||
                      !turnstileWidgetReady
                    }
                    aria-live="polite"
                  >
                    {isSubmittingOrder
                      ? <>
                          {isVerifyingTurnstile && (
                            <LoaderCircle className="turnstile-spinner" size={16} />
                          )}
                          {isVerifyingTurnstile
                            ? t.turnstileChecking
                            : lang === "ru"
                              ? "Отправка..."
                              : "Жіберілуде..."}
                        </>
                      : businessOpen === false
                        ? t.closedStatus
                        : t.checkout}
                    <ArrowRight size={17} />
                  </button>
                  <p className="cart-footnote">
                    {businessOpen === false ? (
                      t.closedOrderMessage
                    ) : (
                      <>
                        <MapPin size={13} /> {t.deliveryArea} · {t.deliveryTime}
                      </>
                    )}
                  </p>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
      <AiChat lang={lang} hidden={cartOpen} onAddToCart={addChatItems} />
    </main>
  );
}

function normalizeKazakhstanPhone(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  return undefined;
}
