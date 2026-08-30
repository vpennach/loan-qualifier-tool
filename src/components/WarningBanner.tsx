export function WarningBanner({
  variant,
  message,
}: {
  variant: "blocking" | "informational";
  message: string;
}) {
  if (variant === "blocking") {
    return (
      <div
        role="alert"
        className="sticky top-0 z-10 flex items-start gap-3 rounded-md border border-red-300 bg-red-50 px-4 py-3 shadow-sm"
      >
        <span aria-hidden className="mt-0.5 text-xl text-red-600">
          ⚠
        </span>
        <div>
          <p className="font-semibold text-red-800">This deal does not qualify</p>
          <p className="text-sm text-red-700">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-10 flex items-start gap-3 rounded-md border border-slate-300 bg-slate-50 px-4 py-3 shadow-sm">
      <span aria-hidden className="mt-0.5 text-xl text-slate-500">
        ℹ
      </span>
      <p className="text-sm text-slate-700">{message}</p>
    </div>
  );
}
