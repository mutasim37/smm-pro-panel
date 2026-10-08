// Pure coupon rules (no I/O) so they can be unit-tested.

export type CouponSpec = {
  code: string | null;
  percent: number | null;
  amountUsd: number | null;
  product: string | null;
  maxUses: number;
  days: number | null;
};

/**
 * Admin input, e.g. `10%`, `$2`, `৳50 product=1234 uses=20 days=7 code=EID24`.
 * BDT amounts are converted with the supplied rate.
 */
export function parseCouponSpec(input: string, bdtRate: number): CouponSpec | null {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const spec: CouponSpec = { code: null, percent: null, amountUsd: null, product: null, maxUses: 1, days: null };
  const head = parts.shift()!;
  let m: RegExpExecArray | null;
  if ((m = /^(\d+(?:\.\d+)?)%$/.exec(head))) {
    const p = Number(m[1]);
    if (!(p > 0 && p <= 100)) return null;
    spec.percent = p;
  } else if ((m = /^\$(\d+(?:\.\d+)?)$/.exec(head))) {
    spec.amountUsd = Number(m[1]);
  } else if ((m = /^৳(\d+(?:\.\d+)?)$/.exec(head))) {
    spec.amountUsd = Math.round((Number(m[1]) / bdtRate) * 10000) / 10000;
  } else return null;
  if (spec.amountUsd !== null && !(spec.amountUsd > 0)) return null;

  for (const part of parts) {
    const [k, v] = part.split("=");
    if (!k || !v) return null;
    const key = k.toLowerCase();
    if (key === "product") spec.product = v.toUpperCase();
    else if (key === "uses") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) return null;
      spec.maxUses = n;
    } else if (key === "days") {
      const n = Number(v);
      if (!(n > 0)) return null;
      spec.days = n;
    } else if (key === "code") {
      if (!/^[A-Za-z0-9_-]{3,24}$/.test(v)) return null;
      spec.code = v.toUpperCase();
    } else return null;
  }
  return spec;
}

/** Discounted price, never below one cent. */
export function applyDiscount(price: number, coupon: { percent: number | null; amount_usd: number | null }): number {
  let out = price;
  if (coupon.percent) out = price * (1 - Number(coupon.percent) / 100);
  else if (coupon.amount_usd) out = price - Number(coupon.amount_usd);
  return Math.max(0.01, Math.round(out * 10000) / 10000);
}

/** A coupon with a product restriction only matches that product (service/item code, or TG country). */
export function productMatches(restriction: string | null, codes: string[]): boolean {
  if (!restriction) return true;
  return codes.map((c) => c.toUpperCase()).includes(restriction.toUpperCase());
}
