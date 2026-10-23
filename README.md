# SIIF · Sistema Integral de Inventario Farmacéutico

Sistema web multiusuario para el inventario de la **Farmacia Hospitalaria (4to piso)** y la **Farmacia de Urgencias** del Hospital San Diego de Alcalá.

> **Sistema auxiliar del SIHO.** No sustituye libros oficiales de controlados, recetas, autorizaciones ni requisitos de COFEPRIS, y no está validado ni certificado. Debe validarse formalmente con el Responsable Sanitario antes de usarse con inventario real.

**Versión 0.2 · Fases 1 y 2:** arquitectura, modelo de datos, autenticación y roles, diseño visual, catálogo y lector de códigos de barras.

---

## Contenido

1. [Qué incluye esta versión](#1-qué-incluye-esta-versión)
2. [Tecnología](#2-tecnología)
3. [Ejecutar en tu computadora](#3-ejecutar-en-tu-computadora)
4. [Publicar en Vercel (con su base PostgreSQL)](#4-publicar-en-vercel)
5. [Primer uso](#5-primer-uso)
6. [Variables de entorno](#6-variables-de-entorno)
7. [Pruebas](#7-pruebas)
8. [Estructura del proyecto](#8-estructura-del-proyecto)
9. [Estado: implementado, pendiente y por validar](#9-estado)

Documentos relacionados: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) (arquitectura y modelo de datos) · [`docs/RESPALDOS.md`](docs/RESPALDOS.md) (plan de respaldo y recuperación).

---

## 1. Qué incluye esta versión

| Módulo | Estado |
|---|---|
| Inicio de sesión, sesiones seguras, bloqueo por intentos, cambio obligatorio de contraseña temporal | ✅ |
| Usuarios y 6 roles (administrador, Responsable Sanitario, encargado, auxiliar, auditor, consulta) | ✅ |
| Bitácora de auditoría de solo agregar, con filtros | ✅ |
| Configuración: nombre, siglas, logotipo, ubicaciones por área, parámetros del lector | ✅ |
| Catálogo: búsqueda (clave, nombre, código, localización SIHO), filtros, paginación, ficha completa, historial | ✅ |
| Presentaciones con factor de conversión explícito a unidad mínima | ✅ |
| Etiquetas de seguridad: controlado (con grupo), LASA, alto riesgo (incluye electrolitos concentrados), cadena fría y antibiótico (texto + ícono, no solo color) | ✅ |
| Marca de cuadro básico de medicamentos | ✅ |
| Grupo terapéutico (Compendio Nacional) asignado a las 826 claves desde el archivo de la farmacia; filtro por grupo | ✅ |
| Controlados (marca y grupo I/II/III, con permiso especial) | ✅ |
| Parámetros por área: mínimo, máximo, punto de reorden, stock de seguridad, tiempo de entrega | ✅ |
| Importación del catálogo del SIHO (corte 15/10/2026: 826 productos, 1,090 registros producto-área) | ✅ |
| Lector de códigos: escaneo global, GS1 (lote/caducidad), anti-duplicados, sonido, vinculación, pantalla de prueba e instrucciones | ✅ |
| Kárdex inmutable, existencias sin negativos, lotes únicos, idempotencia (reglas en la base de datos) | ✅ base lista |
| Entradas, salidas, recepciones, transferencias, caducidades | Fase 3 |
| Inventario físico, controlados, cadena fría, reabastecimiento, dashboard de existencias | Fase 4 |
| Reportes y exportaciones PDF/Excel | Fase 5 |

## 2. Tecnología

- **Next.js 15** (App Router, Server Actions) + **TypeScript** + **Tailwind CSS**.
- **PostgreSQL**. En producción, la base que Vercel provee desde su Marketplace (**Neon**). En desarrollo y pruebas, **PGlite** (PostgreSQL real compilado a WebAssembly), sin instalar nada.
- Autenticación propia: contraseñas con **scrypt**, sesiones guardadas en la base (solo el hash del token), cookie `httpOnly`.
- Sin dependencias de servicios externos adicionales: todo vive en Vercel.

Por qué así: ver [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## 3. Ejecutar en tu computadora

Requisitos: **Node.js 20 o superior** (https://nodejs.org).

```bash
npm install
cp .env.example .env.local        # en Windows: copy .env.example .env.local
```

Edita `.env.local` y pon una clave de instalación de 16+ caracteres:

```
SIIF_CLAVE_INSTALACION=una-frase-larga-que-solo-tu-sepas
```

Deja `DATABASE_URL` vacía para usar la base embebida (se guarda en la carpeta `.siif-local`). Luego:

```bash
npm run dev
```

Abre http://localhost:3000. La primera vez te llevará a **/instalacion** para crear el administrador.

Para probar con un PostgreSQL propio, pon su cadena en `DATABASE_URL` y ejecuta `npm run db:migrate`.

## 4. Publicar en Vercel

1. **Sube el proyecto a GitHub** (repositorio privado).
2. En **vercel.com → Add New → Project**, importa el repositorio. Vercel detecta Next.js solo.
3. **Crea la base de datos:** en el proyecto, pestaña **Storage → Create Database → Neon (Postgres)**. Elige la región más cercana (p. ej. *US West*) y conéctala al proyecto en *Production* y *Preview*. Vercel agrega `DATABASE_URL` automáticamente.
4. **Variables:** en **Settings → Environment Variables** agrega `SIIF_CLAVE_INSTALACION` (16+ caracteres).
5. **Despliega** (Deployments → Redeploy). El build ejecuta `vercel-build`, que **aplica las migraciones** y luego compila.
6. Abre la URL del proyecto → **/instalacion** → crea el administrador.
7. **Borra `SIIF_CLAVE_INSTALACION`** de Vercel y vuelve a desplegar. La pantalla de instalación queda inservible en cuanto existe un usuario, pero la clave ya no hace falta.

Recomendado:
- Activa **Deployment Protection** en Vercel si solo se usará en la red del hospital o con usuarios conocidos.
- Revisa en Neon el plan y la **ventana de restauración** (ver plan de respaldo).

## 5. Primer uso

1. **Configuración → Catálogo inicial del SIHO → Importar.** Carga los 826 productos con su presentación, costo y localización. **No carga existencias**: el inventario inicial saldrá del conteo físico (Fase 4).
2. **Usuarios:** da de alta al equipo. El sistema genera una contraseña temporal que se muestra una sola vez; cada persona la cambia al entrar.
3. **Catálogo:** marca controlados (con su grupo) y asigna etiquetas LASA, alto riesgo y cadena fría.
4. **Lector de códigos → Probar lector:** escanea la etiqueta de prueba para confirmar la configuración de la pistola.
5. **Lector → Escanear:** escanea cajas para vincular sus códigos con la clave correspondiente.

## 6. Variables de entorno

| Variable | Obligatoria | Uso |
|---|---|---|
| `DATABASE_URL` | En producción | Cadena PostgreSQL. Neon/Vercel la crea sola. Vacía = base embebida local. |
| `SIIF_CLAVE_INSTALACION` | Solo para instalar | Clave para crear el primer administrador. Bórrala después. |
| `SIIF_SESION_INACTIVIDAD_MIN` | No (240) | Minutos sin actividad antes de pedir contraseña. |
| `SIIF_SESION_MAX_HORAS` | No (14) | Duración máxima de una sesión. |
| `SIIF_DB_MAX_CONEXIONES` | No (5) | Conexiones por instancia hacia PostgreSQL. |

Nunca se guardan credenciales en el código ni en el repositorio (`.env*` está en `.gitignore`).

## 7. Pruebas

```bash
npm test          # 67 pruebas sobre PostgreSQL real (PGlite), sin configurar nada
npm run typecheck
npm run build
```

Cubren: kárdex inmutable, existencias sin negativos (y reversión completa de la operación), traspasos sin duplicar existencias, idempotencia ante doble registro, lotes no mezclados, reversa única, bitácora inmutable; contraseñas, sesiones (expiración, revocación), bloqueo por intentos, permisos por rol; importación SIHO idempotente; catálogo, factores de conversión, parámetros por área, etiquetas; códigos GTIN/GS1, vínculo verificado vs. propuesto, desvinculación con motivo; detector de pistola, escaneo repetido y conversión de unidades.

Además se probó el flujo completo en navegador (instalación → importación → ficha → escaneo → vinculación → usuarios → permisos de auxiliar → bloqueo).

Las pruebas de entradas, salidas, FEFO y transferencias como operaciones de usuario llegan con la Fase 3. Las reglas de base de datos que las protegen ya están probadas.

## 8. Estructura del proyecto

```
app/                     Pantallas (Next.js App Router)
  (sistema)/             Área con sesión: dashboard, catálogo, lector, usuarios, configuración
  (sistema)/acciones.ts  Acciones del servidor (validan sesión y permiso en cada llamada)
  login, instalacion, cambiar-contrasena
components/              Interfaz (Shell, lector, formularios)
lib/                     Lógica de dominio, independiente de la interfaz y probada
  db-core.ts             Conexión PostgreSQL/PGlite, transacciones, migraciones
  catalogo.ts            Productos, presentaciones, códigos, etiquetas, parámetros
  codigos.ts             GTIN y GS1
  escaner.ts             Detector de pistola y filtro de lecturas repetidas
  permisos.ts            Matriz de roles
  sesiones.ts, contrasenas.ts, usuarios.ts, auditoria.ts, siho.ts
db/migraciones/          Esquema SQL versionado
data/                    Corte del SIHO (15/10/2026) para la importación inicial
scripts/                 migrate, crear-admin, seed-siho, respaldo
tests/                   Pruebas (Vitest)
docs/                    Arquitectura y plan de respaldo
```

## 9. Estado

### Implementado y probado
Todo lo marcado ✅ en la sección 1.

### Pendiente (siguientes fases)
- **Fase 3:** funciones transaccionales de entrada, salida, recepción contra factura, transferencias (solicitud → autorización → envío → recepción), FEFO con advertencias, bloqueo de lotes vencidos o en cuarentena, tablero de caducidades, reversas.
- **Fase 4:** inventario físico con doble conteo y ajuste autorizado de aplicación única, cuadre contra cortes del SIHO, módulo de controlados, cadena fría, reabastecimiento, indicadores de existencias.
- **Fase 5:** reportes PDF/Excel, kárdex por producto y lote, pruebas de carga y concurrencia contra Neon, revisión de seguridad, endurecimiento de despliegue.
- Restricción de usuarios por área (la tabla `usuario_areas` ya existe; falta la interfaz).
- Edición de etiquetas institucionales personalizadas.
- Modo oscuro (no se incluyó: la interfaz es institucional clara).

### A validar con el Responsable Sanitario antes de usarlo con inventario real
1. **Matriz de roles** (quién puede editar catálogo, vincular códigos, marcar controlados).
2. **Unidad mínima y factor por caja** de los productos importados del SIHO. Algunos vienen con unidades como "SOLUCIÓN" o "SUSPENSIÓN" que convendría precisar (frasco, bolsa, ampolleta).
3. **Lista de controlados y grupo**: el sistema NO los infiere; deben marcarse a mano.
4. **Lista institucional LASA y de alto riesgo**.
5. **Costo unitario**: se calculó como promedio ponderado por existencia entre ambas farmacias a partir del costo promedio del SIHO.
6. Política de **contraseñas y tiempo de sesión**.
7. Que el uso como **sistema auxiliar** no se confunda con registros oficiales (libros de controlados, recetas).
8. **Plan de respaldo** y quién lo ejecuta (ver `docs/RESPALDOS.md`).
9. Validación formal del sistema (protocolo de pruebas documentado) antes de apoyarse en él para decisiones regulatorias.
