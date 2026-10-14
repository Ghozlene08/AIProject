export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-3xl font-semibold">Mon App</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        Le frontend Next.js fonctionne. Modifiez{" "}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-sm dark:bg-zinc-800">
          frontend/src/app/page.tsx
        </code>{" "}
        pour commencer.
      </p>
    </main>
  );
}
