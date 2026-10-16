/** Matriz de permisos por rol (principio de mínimo privilegio). Se valida SIEMPRE en el servidor. */

export const ROLES = ['administrador', 'responsable_sanitario', 'encargado', 'auxiliar', 'auditor', 'consulta'] as const;
export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Record<Rol, string> = {
  administrador: 'Administrador del sistema',
  responsable_sanitario: 'Responsable Sanitario',
  encargado: 'Encargado de farmacia',
  auxiliar: 'Auxiliar de farmacia',
  auditor: 'Auditor',
  consulta: 'Consulta',
};

export const PERMISOS = {
  'catalogo.ver': 'Consultar el catálogo',
  'catalogo.editar': 'Crear y editar productos, presentaciones y parámetros',
  'catalogo.etiquetas': 'Asignar etiquetas LASA, alto riesgo, cadena fría y grupo de controlado',
  'codigos.vincular': 'Vincular códigos de barras (quedan verificados)',
  'codigos.proponer': 'Proponer vínculos de código (quedan sin verificar)',
  'codigos.verificar': 'Verificar o desactivar vínculos de código',
  'lector.usar': 'Usar y probar el lector de códigos',
  'usuarios.administrar': 'Crear usuarios, asignar roles y restablecer contraseñas',
  'configuracion.editar': 'Editar nombre, logotipo, áreas y ubicaciones',
  'catalogo.importar': 'Importar el catálogo desde el SIHO',
  'auditoria.ver': 'Consultar la bitácora de auditoría',
} as const;
export type Permiso = keyof typeof PERMISOS;

const TODOS = Object.keys(PERMISOS) as Permiso[];

const MATRIZ: Record<Rol, readonly Permiso[]> = {
  administrador: TODOS,
  responsable_sanitario: TODOS,
  // Las etiquetas de seguridad y el grupo de controlados los define el Responsable Sanitario
  encargado: ['catalogo.ver', 'catalogo.editar', 'codigos.vincular', 'codigos.proponer', 'codigos.verificar', 'lector.usar'],
  auxiliar: ['catalogo.ver', 'codigos.proponer', 'lector.usar'],
  auditor: ['catalogo.ver', 'auditoria.ver', 'lector.usar'],
  consulta: ['catalogo.ver'],
};

export function tienePermiso(rol: Rol | string | null | undefined, permiso: Permiso): boolean {
  if (!rol || !(rol in MATRIZ)) return false;
  return MATRIZ[rol as Rol].includes(permiso);
}

export function permisosDe(rol: Rol): readonly Permiso[] {
  return MATRIZ[rol] ?? [];
}

export class ErrorPermiso extends Error {
  constructor(public permiso: Permiso) {
    super(`No tienes permiso para: ${PERMISOS[permiso].toLowerCase()}.`);
    this.name = 'ErrorPermiso';
  }
}
