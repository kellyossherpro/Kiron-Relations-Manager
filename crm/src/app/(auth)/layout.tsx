export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 py-10">
      <div className="w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/krm-logo-compact.png" alt="KRM, Kiron Relations Manager" className="mx-auto mb-8 w-72" />
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
