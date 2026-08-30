"use client";

import { useActionState, useRef, useEffect } from "react";
import { createShop, type CreateShopState } from "@/actions/admin-shops";

const initialState: CreateShopState = { error: null };

export function CreateShopForm() {
  const [state, formAction, pending] = useActionState(createShop, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="flex items-end gap-3">
      <div className="flex-1">
        <label htmlFor="shop_name" className="block text-sm font-medium text-slate-700">
          New Shop Name
        </label>
        <input
          id="shop_name"
          name="shop_name"
          type="text"
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Creating..." : "Create Shop"}
      </button>
      {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
    </form>
  );
}
