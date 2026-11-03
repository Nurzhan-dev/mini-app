"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Flame,
  Leaf,
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
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("delivery");
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
  const delivery = subtotal >= 5000 || subtotal === 0 ? 0 : 500;
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
  const add = (id: number, quantity = 1) =>
    setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + quantity }));
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
  const change = (id: number, amount: number) =>
    setCart((current) => {
      const quantity = (current[id] ?? 0) + amount;
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    });
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
    if (!phone.trim()) {
      alert(lang === "ru" ? "Укажите номер телефона." : "Телефон нөмірін көрсетіңіз.");
      return;
    }
    if (deliveryMethod === "delivery" && !address.trim()) {
      alert(lang === "ru" ? "Укажите адрес доставки." : "Жеткізу адресін көрсетіңіз.");
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
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          items,
          phone,
          address: deliveryMethod === "delivery" ? address : "",
          deliveryMethod,
          notes,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? "ORDER_FAILED");
      }

      setCart({});
      setPhone("");
      setAddress("");
      setNotes("");
      setDeliveryMethod("delivery");
      setOrdered(true);
    } catch (error) {
      console.error("Order submit failed", error);
      setOrdered(false);
      alert(lang === "ru" ? "Не удалось сохранить заказ. Проверьте настройки Supabase и Telegram." : "Тапсырыс сақталмады. Supabase және Telegram конфигурациясын тексеріңіз.");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  return (
    <main className="app-shell">
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
          <span className="open-dot" /> {t.openStatus}
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
              setOrdered(false);
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
            if (event.target === event.currentTarget) setCartOpen(false);
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
                onClick={() => setCartOpen(false)}
                aria-label={t.closeLabel}
              >
                <X size={19} />
              </button>
            </div>

            {ordered ? (
              <div className="order-success">
                <div className="success-icon">
                  <Check size={28} />
                </div>
                <h3>{t.orderReady}</h3>
                <p>{t.orderHint}</p>
                <button
                  className="checkout-button"
                  onClick={() => {
                    setCartOpen(false);
                    setOrdered(false);
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

                  <div className="order-form">
                    <label className="order-field">
                      <span>{t.phoneLabel}</span>
                      <input
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder={t.phonePlaceholder}
                      />
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
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder={t.notesPlaceholder}
                      />
                    </label>
                  </div>

                  <div className="price-row">
                    <span>{t.subtotal}</span>
                    <b>{money(subtotal)}</b>
                  </div>
                  <div className="price-row">
                    <span>{t.delivery}</span>
                    <b>{delivery ? money(delivery) : t.free}</b>
                  </div>
                  <div className="price-total">
                    <span>{t.total}</span>
                    <b>{money(subtotal + delivery)}</b>
                  </div>
                  <button
                    className="checkout-button"
                    onClick={submitOrder}
                    disabled={isSubmittingOrder}
                  >
                    {isSubmittingOrder ? (lang === "ru" ? "Отправка..." : "Жіберілуде...") : t.checkout}
                    <ArrowRight size={17} />
                  </button>
                  <p className="cart-footnote">
                    <MapPin size={13} /> {t.deliveryArea} · {t.deliveryTime}
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
