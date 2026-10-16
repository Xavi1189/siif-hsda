export const metadata = { title: 'Falta la base de datos' };

export default function Pagina() {
  return <SinBase />;
}

function SinBase() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="tarjeta max-w-lg p-6">
        <p className="font-titulo text-[22px] font-bold text-marino">SIIF está publicado, falta conectar la base de datos</p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] text-tenue">
          <li>En Vercel abre el proyecto <strong className="text-tinta">siif-hsda</strong> → pestaña <strong className="text-tinta">Storage</strong>.</li>
          <li><strong className="text-tinta">Create Database → Neon (Postgres)</strong>, región <em>US East (Washington, D.C.)</em>.</li>
          <li>Conéctala al proyecto en Production y Preview.</li>
          <li>Vuelve a desplegar (Deployments → ⋯ → Redeploy). Las tablas se crean solas.</li>
        </ol>
      </div>
    </main>
  );
}
