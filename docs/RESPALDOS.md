# Plan de respaldo y recuperación

Toda la información de SIIF vive en la base PostgreSQL. El código está en GitHub y se puede volver a desplegar en minutos. Respaldar SIIF es respaldar la base.

## 1. Capas de protección

| Capa | Qué cubre | Responsable |
|---|---|---|
| **Restauración a un punto en el tiempo (Neon)** | Errores recientes: volver la base a un minuto específico dentro de la ventana de historial de tu plan. | Automática. Confirma la ventana de tu plan en la consola de Neon. |
| **Respaldo lógico diario (`pg_dump`)** | Pérdida mayor, borrado de proyecto, auditorías y migración de proveedor. | Administrador del sistema |
| **Copia fuera de la nube** | Que una sola cuenta comprometida no pueda borrar todo. | Responsable Sanitario o TI |
| **Kárdex inmutable** | Ningún usuario puede borrar ni alterar movimientos desde el sistema; una corrección es una reversa visible. | El propio sistema |

## 2. Respaldo lógico

Requiere las herramientas cliente de PostgreSQL (`pg_dump`, versión igual o mayor a la del servidor).

1. En Neon, copia la cadena de conexión **directa** (sin `-pooler`), no la del pool.
2. Ejecuta:

```bash
DATABASE_URL_DIRECTA="postgresql://...neon.tech/neondb?sslmode=require" ./scripts/respaldo.sh
```

Esto genera `respaldos/siif-AAAA-MM-DD_HHMM.dump` (formato comprimido de PostgreSQL) y su suma SHA-256.

**Frecuencia sugerida:**
- **Diario**, al cierre del turno vespertino, mientras se use en operación.
- **Antes de cada actualización** de versión (cada fase nueva trae migraciones).
- **Al cerrar cada inventario físico.**

**Retención sugerida:** 14 diarios, 8 semanales y 12 mensuales. Los respaldos de cierres de inventario se conservan por el mismo tiempo que la documentación de inventario del área.

**Dónde guardarlos:** en una unidad institucional con acceso restringido y, además, en una segunda ubicación (disco cifrado bajo resguardo de la jefatura). Contienen nombres de usuarios y datos operativos: trátalos como información confidencial.

## 3. Restauración

### Error reciente (dentro de la ventana de Neon)
1. Consola de Neon → proyecto → **Branches → Restore** al minuto anterior al incidente. Neon puede crear antes una rama de respaldo del estado actual.
2. Verifica en SIIF: Dashboard, búsqueda de productos y bitácora.
3. Registra el incidente: qué pasó, hora, a qué punto se restauró y quién lo autorizó.

### Desde un archivo `.dump`
1. Crea una base vacía (una rama nueva en Neon o una base nueva).
2. Restaura:
```bash
pg_restore --no-owner --no-privileges --dbname "postgresql://.../base_nueva?sslmode=require" respaldos/siif-AAAA-MM-DD_HHMM.dump
```
3. Apunta `DATABASE_URL` del proyecto en Vercel a la base restaurada y vuelve a desplegar.
4. Ejecuta la conciliación: `SELECT * FROM siif_verificar_existencias();` debe devolver **cero filas**.

## 4. Simulacro

**Cada mes**, restaura el último respaldo en una rama de prueba de Neon y verifica que:
- La aplicación abre y permite iniciar sesión.
- El número de productos, códigos y usuarios coincide con producción.
- `siif_verificar_existencias()` devuelve cero filas (cuando ya haya movimientos).

Anota la fecha, el respaldo usado, el resultado y quién lo hizo. Un respaldo que nunca se ha restaurado no está comprobado.

## 5. Antes de usarlo con inventario real

- [ ] Confirmar el plan de Neon y su ventana de restauración.
- [ ] Definir quién ejecuta el respaldo diario y dónde se guarda.
- [ ] Hacer el primer simulacro de restauración completo.
- [ ] Documentar este procedimiento en el manual del área.
