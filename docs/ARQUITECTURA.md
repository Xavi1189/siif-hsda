# Arquitectura de SIIF

## Decisiones técnicas

| Decisión | Por qué |
|---|---|
| **Next.js en Vercel** | Un solo proyecto con interfaz y servidor. Vercel ya lo usa la jefatura para otros proyectos; no hay servidores que mantener. |
| **PostgreSQL (Neon desde Vercel)** | Transacciones reales, restricciones de integridad, triggers y bloqueos de renglón. Se provee desde el Marketplace de Vercel sin cuentas adicionales. Se descartó una base documental (sin transacciones) y `localStorage`. |
| **PGlite para desarrollo y pruebas** | Es el mismo motor PostgreSQL. Las pruebas corren las migraciones reales sin instalar nada. |
| **Autenticación propia en lugar de un proveedor externo** | Se pidió no usar Supabase. Con scrypt y sesiones en la base no hace falta otro servicio. La validación ocurre en el servidor en cada página y cada acción. |
| **Reglas críticas en la base de datos, no solo en el código** | Inmutabilidad del kárdex, saldos no negativos y lotes únicos se cumplen aunque alguien escriba SQL directo o un error de programación lo intente. |
| **Cantidades en unidad mínima, como enteros** | Evita errores de redondeo y de mezcla caja/pieza. La conversión usa factores explícitos por presentación. |

## Capas

```
Navegador ─► Next.js (Server Components + Server Actions) ─► lib/ (dominio) ─► PostgreSQL
              │ exigirUsuario(permiso) en cada página          │ funciones puras con (tx, actor)
              │ accion(permiso, fn) en cada mutación           │ verifican permiso otra vez
              └ cookie httpOnly con token de sesión            └ escriben auditoría en la misma transacción
```

- **Middleware**: solo redirige a /login si no hay cookie (filtro rápido). No es la barrera de seguridad.
- **Servidor**: `exigirUsuario()` y `accion()` (en `lib/servidor.ts`) validan la sesión en la base, la expiración, el cambio de contraseña pendiente y el permiso.
- **Dominio** (`lib/`): cada función recibe la transacción y el actor, y vuelve a verificar el permiso. Así las reglas se prueban sin interfaz.
- **Base de datos**: triggers y restricciones son la última línea de defensa.

## Integridad de existencias

1. **Kárdex de solo agregar.** `operaciones` y `movimientos` rechazan UPDATE, DELETE y TRUNCATE (trigger `siif_bloquear_cambios`). Una corrección es una operación de **reversa** que referencia a la original (`revierte_a`, única: solo se revierte una vez).
2. **Saldo en la misma transacción.** Cada movimiento aplica su cantidad a `existencias` mediante un trigger. Primero hace UPDATE, que bloquea el renglón: dos salidas simultáneas del mismo lote se aplican una tras otra. Después hace INSERT si el renglón no existía.
3. **Sin negativos.** `existencias.cantidad >= 0` es una restricción. Si un movimiento dejaría saldo negativo, falla la **operación completa** (todos sus renglones).
4. **Existencias protegidas.** No se pueden escribir directamente, solo a través de movimientos.
5. **Conciliación.** `siif_verificar_existencias()` compara el saldo guardado con la suma del kárdex. Debe devolver cero filas.
6. **Idempotencia.** Cada operación lleva `clave_idempotencia` única, generada al abrir la captura: un doble Enter o un reintento no registra dos veces.
7. **Transferencias sin duplicar.** Salen del origen hacia la ubicación virtual *En tránsito* y desde ahí entran al destino. Cada paso es una operación balanceada.
8. **Lotes.** `(producto, lote, caducidad)` es único (con `NULLS NOT DISTINCT`). Un lote siempre pertenece a un solo producto.

## Modelo de datos

```
configuracion (1 fila)          usuarios ─┬─ sesiones
                                          ├─ usuario_areas ── areas ── ubicaciones
                                          └─ auditoria (solo agregar)

productos ─┬─ presentaciones (factor → unidad mínima)
           ├─ codigos_barras (código activo único → presentación)
           ├─ producto_etiquetas ── etiquetas (LASA, alto riesgo, cadena fría…)
           ├─ parametros_area (mín, máx, reorden, seguridad, ubicación) ── areas
           └─ lotes (lote + caducidad + estatus)

conceptos ── operaciones (cabecera, idempotente, autorización, reversa)
                 └─ movimientos (renglones ±, inmutables) ─► existencias (ubicación × lote, ≥ 0)

transferencias ── transferencia_renglones          (lógica en Fase 3)
conteos ── conteo_renglones (ronda 1/2)            (lógica en Fase 4)
```

| Tabla | Clave / restricciones relevantes |
|---|---|
| `productos` | `clave` única (la misma del SIHO); `costo_unitario >= 0`; grupo de controlado solo si es controlado. |
| `presentaciones` | `factor` entero 1–100,000; `(producto, nombre, factor)` único; la unidad mínima (factor 1) se crea sola. |
| `codigos_barras` | Índice único parcial sobre `codigo` activo; trigger que exige que la presentación sea del mismo producto; `verificado` para vínculos propuestos por auxiliares. |
| `lotes` | Único `(producto, numero_lote, caducidad)`; estatus liberado / cuarentena / bloqueado. |
| `existencias` | PK `(ubicacion, lote)`; `cantidad >= 0`; solo escribible desde movimientos. |
| `operaciones` | `clave_idempotencia` única; `revierte_a` única; inmutable. |
| `movimientos` | `cantidad <> 0` con signo; inmutable; el lote debe ser del producto. |
| `auditoria` | Inmutable; usuario, acción, entidad, detalle (JSON con antes/después), IP. |

## Seguridad

- Contraseñas con **scrypt** (N=32768) y sal aleatoria; nunca en texto plano.
- Token de sesión aleatorio de 256 bits; en la base solo su **SHA-256**. Cookie `httpOnly`, `Secure` en producción, `SameSite=Lax`.
- Expiración por inactividad (4 h) y absoluta (14 h). Revocación al cerrar sesión, al cambiar o restablecer la contraseña, al cambiar el rol y al desactivar al usuario.
- **Bloqueo** de 15 minutos tras 5 intentos fallidos. Mensajes genéricos que no revelan qué usuarios existen. Cada intento fallido queda en la bitácora.
- Server Actions de Next.js con verificación de origen (protección CSRF incluida).
- Encabezados: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- El logotipo se valida por firma de archivo (PNG/JPG/WebP). No se aceptan SVG, porque pueden traer scripts.
- Instalación protegida por clave de entorno y bloqueo de tabla: solo funciona mientras no hay usuarios.
- Debe quedar al menos un administrador activo. Nadie puede cambiar su propio rol ni desactivarse.

## Lector de códigos de barras

- La pistola (USB, Bluetooth o base USB) actúa como **teclado**: no requiere controladores.
- `DetectorEscaneo` distingue una ráfaga de pistola (≤ 35 ms promedio entre teclas, termina en Enter o Tab) de una persona escribiendo. Funciona en **cualquier pantalla**, y revierte lo que la ráfaga haya tecleado en un campo enfocado.
- `FiltroDuplicados` ignora una lectura idéntica dentro de la ventana configurable (1.5 s por omisión).
- Los EAN-8, UPC-A, EAN-13 y GTIN-14 se normalizan a **GTIN-14** con validación de dígito verificador.
- **GS1** (AI 01, 10, 17, 11, 15, 21, 30) con FNC1, paréntesis o identificador de simbología. Lote y caducidad leídos se muestran para **confirmarse**, nunca se dan por buenos sin revisión.
- La pantalla de prueba incluye una etiqueta **Code 128** con símbolos que delatan una distribución de teclado mal configurada.
