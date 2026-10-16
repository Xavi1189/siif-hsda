'use client';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Aviso } from './ui';

type Accion = (s: { error?: string }, f: FormData) => Promise<{ error?: string }>;

export interface CampoDef { name: string; label: string; type?: string; autoComplete?: string; ayuda?: string; required?: boolean; placeholder?: string }

function Enviar({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return <button className="btn-primario w-full py-2.5" disabled={pending}>{pending ? 'Un momento…' : texto}</button>;
}

export function FormularioAcceso({ accion, campos, boton, nota }: { accion: Accion; campos: CampoDef[]; boton: string; nota?: React.ReactNode }) {
  const [estado, enviar] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate={false}>
      {estado?.error && <Aviso tono="peligro">{estado.error}</Aviso>}
      {campos.map((c, i) => (
        <div key={c.name}>
          <label htmlFor={c.name} className="etiqueta-campo">{c.label}</label>
          <input id={c.name} name={c.name} type={c.type ?? 'text'} autoComplete={c.autoComplete} required={c.required ?? true}
            placeholder={c.placeholder} autoFocus={i === 0} className="campo py-2.5" autoCapitalize="none" spellCheck={false} />
          {c.ayuda && <p className="mt-1 text-[12px] text-tenue">{c.ayuda}</p>}
        </div>
      ))}
      <Enviar texto={boton} />
      {nota && <div className="text-[13px] text-tenue">{nota}</div>}
    </form>
  );
}
