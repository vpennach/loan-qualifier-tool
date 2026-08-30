"use client";

import { useActionState } from "react";
import { submitShopCode, type ShopCodeState } from "@/actions/shop-auth";

const initialState: ShopCodeState = { error: null };

export function ShopCodeForm() {
  const [state, formAction, pending] = useActionState(submitShopCode, initialState);

  return (
    <form action={formAction} className="w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="shop_code" className="block text-sm font-medium text-slate-700">
          Shop Code
        </label>
        <input
          id="shop_code"
          name="shop_code"
          type="text"
          autoComplete="off"
          autoFocus
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-lg tracking-wide shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Checking..." : "Enter"}
      </button>
    </form>
  );
}
