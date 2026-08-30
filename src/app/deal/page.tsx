import { requireActiveShop } from "@/lib/require-shop";
import { logoutShop } from "@/actions/shop-auth";
import { DealForm } from "@/components/DealForm";

export default async function DealPage() {
  const shop = await requireActiveShop();

  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between">
          <span className="text-sm font-medium text-slate-700">{shop.shop_name}</span>
          <form action={logoutShop}>
            <button type="submit" className="text-xs text-slate-400 underline hover:text-slate-600">
              Switch shop
            </button>
          </form>
        </div>
      </header>
      <DealForm />
    </div>
  );
}
