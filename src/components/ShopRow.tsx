"use client";

import { useTransition } from "react";
import { setShopActive } from "@/actions/admin-shops";
import type { Shop } from "@/lib/types";

export function ShopRow({ shop }: { shop: Shop }) {
  const [isPending, startTransition] = useTransition();

  return (
    <tr className="border-b border-slate-100">
      <td className="py-3 pr-4 font-medium text-slate-900">{shop.shop_name}</td>
      <td className="py-3 pr-4 font-mono text-sm tracking-wide text-slate-600">{shop.shop_code}</td>
      <td className="py-3 pr-4">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            shop.active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"
          }`}
        >
          {shop.active ? "Active" : "Deactivated"}
        </span>
      </td>
      <td className="py-3 text-right">
        <button
          disabled={isPending}
          onClick={() => startTransition(() => setShopActive(shop.id, !shop.active))}
          className="text-sm font-medium text-slate-600 underline hover:text-slate-900 disabled:opacity-50"
        >
          {shop.active ? "Deactivate" : "Reactivate"}
        </button>
      </td>
    </tr>
  );
}
