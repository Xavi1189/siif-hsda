'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, KeyRound, UserPlus } from 'lucide-react';
import { crearUsuarioAccion, modificarUsuarioAccion, restablecerAccion } from '@/app/(sistema)/acciones';
import { NOMBRE_ROL, ROLES, type Rol } from '@/lib/permisos';
import { fechaHora } from '@/lib/formato';
import { useAccion } from '../useAccion';
import { Aviso, Insignia } from '../ui';

export interface FilaUsuario { id: string; usuario: string; nombre: string; cargo: string | null; rol: Rol; activo: boolean; ultimo_acceso: string | null; bloqueado: boolean; debe_cambiar: boolean }

function ContrasenaTemporal({ usuario, temporal, cerrar }: { usuario: string; temporal: string; cerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="rounded-md border border-teal/30 bg-teal-claro p-3" role="status">
      <p className="text-[14px]">Contraseña temporal de <strong>{usuario}</strong>. Entrégala en persona; solo se muestra esta vez y deberá cambiarla al entrar.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="select-all rounded bg-white px-3 py-1.5 font-mono text-[18px] tracking-wider">{temporal}</code>
        <button className="btn-secundario btn-chico" onClick={async () => { try { await navigator.clipboard.writeText(temporal); setCopiado(true); } catch { /* selección manual */ } }}>
          <Copy size={14} aria-hidden />{copiado ? 'Copiada' : 'Copiar'}</button>
        <button className="btn-fantasma btn-chico" onClick={cerrar}>Listo</button>
      </div>
    </div>
  );
}

export function GestionUsuarios({ usuarios, yo, soyAdmin }: { usuarios: FilaUsuario[]; yo: string; soyAdmin: boolean }) {
  const router = useRouter();
  const { pendiente, estado, setEstado, ejecutar } = useAccion();
  const [nuevo, setNuevo] = useState({ usuario: '', nombre: '', cargo: '', rol: 'auxiliar' });
  const [temporal, setTemporal] = useState<{ usuario: string; temporal: string } | null>(null);
  const rolesAsignables = ROLES.filter((r) => soyAdmin || r !== 'administrador');

  return (
    <div className="flex flex-col gap-5">
      {temporal && <ContrasenaTemporal {...temporal} cerrar={() => setTemporal(null)} />}
      {estado && <Aviso tono={estado.tono}>{estado.texto}{estado.campos && <ul className="mt-1 list-disc pl-5">{Object.values(estado.campos).map((m) => <li key={m}>{m}</li>)}</ul>}</Aviso>}

      <form className="tarjeta grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1.2fr_1fr_auto]" onSubmit={(e) => {
        e.preventDefault(); setEstado(null);
        ejecutar(() => crearUsuarioAccion(nuevo), (r) => { setTemporal({ usuario: nuevo.usuario.toLowerCase(), temporal: r.temporal! }); setNuevo({ usuario: '', nombre: '', cargo: '', rol: 'auxiliar' }); router.refresh(); });
      }}>
        <p className="rotulo sm:col-span-2 lg:col-span-5">Nuevo usuario</p>
        <div><label htmlFor="n-usuario" className="etiqueta-campo">Usuario</label><input id="n-usuario" className="campo" value={nuevo.usuario} onChange={(e) => setNuevo({ ...nuevo, usuario: e.target.value })} placeholder="nombre.apellido" autoCapitalize="none" required /></div>
        <div><label htmlFor="n-nombre" className="etiqueta-campo">Nombre completo</label><input id="n-nombre" className="campo" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required /></div>
        <div><label htmlFor="n-cargo" className="etiqueta-campo">Cargo</label><input id="n-cargo" className="campo" value={nuevo.cargo} onChange={(e) => setNuevo({ ...nuevo, cargo: e.target.value })} placeholder="Auxiliar de farmacia, turno matutino" /></div>
        <div><label htmlFor="n-rol" className="etiqueta-campo">Rol</label>
          <select id="n-rol" className="campo" value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
            {rolesAsignables.map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}
          </select></div>
        <div className="flex items-end"><button className="btn-primario w-full" disabled={pendiente}><UserPlus size={16} aria-hidden />Crear</button></div>
      </form>

      <div className="tarjeta overflow-x-auto">
        <table className="tabla min-w-[760px]">
          <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th className="text-right">Acciones</th></tr></thead>
          <tbody>
            {usuarios.map((u) => {
              const propio = u.id === yo;
              const protegido = propio || (u.rol === 'administrador' && !soyAdmin);
              return (
                <tr key={u.id} className={u.activo ? '' : 'opacity-60'}>
                  <td><span className="font-medium">{u.nombre}</span>{propio && <span className="ml-1 text-[12px] text-tenue">(tú)</span>}<span className="block font-mono text-[12px] text-tenue">{u.usuario}{u.cargo && <span className="font-sans"> · {u.cargo}</span>}</span></td>
                  <td>
                    <label htmlFor={`rol-${u.id}`} className="sr-only">Rol de {u.nombre}</label>
                    <select id={`rol-${u.id}`} className="campo py-1 text-[13px]" value={u.rol} disabled={protegido || pendiente}
                      onChange={(e) => ejecutar(() => modificarUsuarioAccion(u.id, { rol: e.target.value }), () => router.refresh())}>
                      {(soyAdmin ? ROLES : u.rol === 'administrador' ? ROLES : rolesAsignables).map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}
                    </select>
                  </td>
                  <td className="whitespace-nowrap">
                    {u.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia>Desactivado</Insignia>}
                    {u.bloqueado && <span className="ml-1"><Insignia tono="peligro">Bloqueado</Insignia></span>}
                    {u.debe_cambiar && u.activo && <span className="ml-1"><Insignia tono="alerta">Contraseña temporal</Insignia></span>}
                  </td>
                  <td className="whitespace-nowrap font-mono text-[12px] text-tenue">{u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : 'Nunca'}</td>
                  <td className="whitespace-nowrap text-right">
                    {!protegido && (
                      <>
                        <button className="btn-fantasma btn-chico" disabled={pendiente} onClick={() => ejecutar(() => restablecerAccion(u.id), (t) => { setTemporal({ usuario: u.usuario, temporal: t }); router.refresh(); })}>
                          <KeyRound size={14} aria-hidden />Restablecer</button>
                        <button className="btn-fantasma btn-chico" disabled={pendiente} onClick={() => ejecutar(() => modificarUsuarioAccion(u.id, { activo: !u.activo }), () => router.refresh())}>
                          {u.activo ? 'Desactivar' : 'Reactivar'}</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-tenue">Los usuarios no se borran: se desactivan, para conservar la trazabilidad de lo que registraron. Desactivar o cambiar el rol cierra sus sesiones abiertas.</p>
    </div>
  );
}
