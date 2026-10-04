# Picado — Documentación funcional completa (para rediseño desde cero)

Fuentes: `CLAUDE.md`, `.orchestra/PLAN.md`, `.orchestra/BOARD.md`, `docs/DEPLOY.md`, `lib/settings/*`, migraciones SQL, motores en `lib/`.
Estado: M0–M5 + M7 completos y verificados (33 tareas). M6 (deploy a producción) pendiente.

---

## 1. Qué es
**Picado** es una PWA mobile-first para organizar competencias de fútbol real (fútbol 5/6/7/8/9/11) entre amigos.
Cada jugador tiene una **carta estilo FC 26 (FIFA)** cuyos atributos salen de **votos de sus compañeros** y se actualizan
con el **rendimiento en cada partido**. Incluye partidos amistosos, torneos con llaves automáticas, estadísticas
conciliadas entre reportes de varios jugadores, ranking de impacto (OpenSkill), insignias, notificaciones push y plantillas FUT.

- Idioma UI: español rioplatense con voseo ("Votá", "Cargá tus estadísticas"). Fechas es-AR, zona America/Argentina/Buenos_Aires.
- Fuera de alcance v1: modo videojuego EA FC (v2, sería un `kind` de partido separado que nunca toca la carta real).

## 2. Decisiones de producto (aprobadas por el usuario)
1. **Solo fútbol real** en v1.
2. **Múltiples grupos.** Admins crean/organizan; miembros entran con link de invitación.
3. **Roles:** owner / admin / member / **spectator** (asignado por admin; puede calificar jugadores post-partido pero no jugar ni votar scouting).
4. **Jugadores invitados (guest):** perfiles placeholder sin cuenta; se pueden reclamar al registrarse; no votan.
5. **Cada miembro tiene una fila "player" por grupo** (identidad dentro del grupo). Al irse, se conserva el historial.
6. **Tamaño de equipo configurable** (5/6/7/8/9/11), default 5.
7. **Torneos**: equipos armados por organizador **o** inscripción individual con sorteo de equipos balanceados (OpenSkill + OVR). Los amistosos también cuentan.
8. **"Todo configurable"** con defaults razonables: settings de grupo y de torneo en JSON validado (zod).
9. **Partidos solo con resultado** (sin goleadores) finalizan igual: los goles quedan "sin atribuir" y un admin los asigna después ("Asignar goles").
10. **Finalización automática**: opción A — pg_cron cada 10 min + pg_net llama al endpoint de finalización (secretos en Supabase Vault).
11. **M7 Plantillas** (pedido 2026-09-24): "equipo ideal" por usuario (diversión) + alineaciones reales sobre la cancha; química, OVR de equipo, formaciones, publicar/compartir/likes ("Equipo de la semana"); **clubes** con escudo subido y colores.
12. Login: Google + Discord OAuth + magic link (email+password solo dev/e2e).

## 3. MVPs / Milestones
| Hito | Contenido | Estado |
|---|---|---|
| M0 Scaffold | Next 16, TS 5.9, Tailwind 4/shadcn, ESLint, Vitest, Playwright, Supabase, scripts | ✔ |
| M1 Auth, grupos, roles | Login OAuth/magic link, perfiles, grupos, miembros/roles, invitaciones, invitados + reclamo, ajustes del grupo, editor de perfil de jugador | ✔ |
| M2 Cartas y scouting | Modelo de atributos FC 26, posiciones, motor de rating, votos de scouting (rápido/detallado, arqueros), carta FUT, radar, perfil de jugador | ✔ |
| M3 Partidos | Amistosos, alineaciones (jugadores + espectadores), auto-balanceo, reportes de resultado/estadísticas, conciliación, calificaciones post-partido, disputas, finalización (manual + cron), OpenSkill, historial | ✔ |
| M4 Torneos | 5 formatos, generación/avance de llaves, inscripción por equipos o individual, vistas de llave/tabla/fechas, tiempo real | ✔ |
| M5 Engagement | Rankings, dashboard personal con gráficos, insignias, push, imagen compartible de carta, feed, PWA instalable | ✔ |
| M7 Plantillas | Clubes (escudo, colores, plantel), constructor de plantillas en cancha, química/OVR, publicar/likes/compartir, equipo de la semana, alineación de partido en cancha, clubes en torneos | ✔ |
| M6 Hardening & deploy | Auditoría de seguridad ✔, e2e ✔, seed demo ✔ · **Pendiente:** Supabase prod, Vercel, credenciales OAuth, secretos Vault | ⏳ |

## 4. Pantallas (rutas)
| Ruta | Función |
|---|---|
| `/` | Landing |
| `/login`, `/auth/callback`, `/auth/auth-code-error` | Login Google/Discord/magic link |
| `/invitacion/[code]` | Unirse a un grupo por invitación |
| `/g` | Mis grupos / crear grupo |
| `/g/[groupId]` | Home del grupo: acciones pendientes (reportar, calificar), próximos partidos, feed |
| `/g/[id]/jugadores/[playerId]` | Carta FUT, radar, atributos, stats, insignias, historial, compartir |
| `.../jugadores/[playerId]/editar` | Posición principal/alternativas, pie hábil, altura |
| `.../jugadores/[playerId]/votar` | Votar scouting (rápido por stat de cara / detallado por sub-atributo / arquero; PlayStyles; estrellas) |
| `/g/[id]/partidos`, `/partidos/nuevo` | Lista y creación de partidos |
| `/g/[id]/partidos/[matchId]` | Detalle: reportar resultado y stats, calificar jugadores (1–10 + "se destacó en" ≤2), disputa, finalizar, resultado final, asignar goles |
| `.../partidos/[matchId]/equipos` | Alineación sobre la cancha + auto-balanceo + aplicar al partido |
| `/g/[id]/torneos`, `/torneos/nuevo` | Lista y creación (stepper, elección de formato) |
| `/g/[id]/torneos/[tid]` | Hub: estado, inscripciones, equipos/entradas ("Usar club"), generar |
| `.../llave`, `.../tabla`, `.../fechas` | Llave (realtime), tablas de posiciones, fixture |
| `/g/[id]/rankings` | Leaderboards (OVR, Impacto, goles, asistencias, MVP…) |
| `/g/[id]/clubes`, `/clubes/[clubId]` | Clubes: crear/editar, colores, escudo, plantel con dorsales |
| `/g/[id]/plantillas`, `/nueva`, `/[squadId]` | Mis plantillas, constructor, publicar/like/compartir, equipo de la semana |
| `/g/[id]/ajustes` | Admin: miembros, roles, invitaciones, invitados, settings del grupo |
| `/yo`, `/yo/ajustes` | Dashboard personal (evolución OVR/atributos, forma, stats) y preferencias de notificación/push |
| `/notificaciones` | Centro de notificaciones (campanita) |
| `/api/og/card/[playerId]`, `/api/og/squad/[id]` | Imágenes compartibles (carta / plantilla publicada) |
| `/api/cron/finalize` | Finalizador (Bearer `CRON_SECRET`) |
| `/dev/cards` | Solo desarrollo: galería de cartas |

Navegación: barra inferior en mobile, tema oscuro por defecto, diseño base 375px.

## 5. Carta y atributos (modelo FC 26)
- **29 sub-atributos de campo** agrupados en 6 stats de cara:
  - RIT = .55 Velocidad + .45 Aceleración
  - TIR = .45 Definición + .20 Potencia + .20 Tiros lejanos + .05 Posicionamiento + .05 Voleas + .05 Penales
  - PAS = .35 Pase corto + .20 Visión + .20 Centros + .15 Pase largo + .05 Efecto + .05 Tiro libre
  - REG = .50 Regate + .35 Control + .10 Agilidad + .05 Equilibrio (también Reacciones, Compostura como subs)
  - DEF = .30 Conciencia def. + .30 Entrada de pie + .20 Intercepciones + .10 Cabezazo + .10 Barrida
  - FIS = .50 Fuerza + .25 Resistencia + .20 Agresividad + .05 Salto
- **Arquero (5):** Estirada, Manejo, Saque, Reflejos, Colocación (+ VEL = RIT). Carta POR: DIV/HAN/KIC/REF/POS/SPD.
- **15 posiciones:** POR, LI, DFC, LD, CAI, CAD, MCD, MC, MCO, MI, MD, EI, ED, SD, DC. OVR por posición = suma ponderada (pesos estilo FIFA). La carta muestra el OVR de la posición principal.
- **Extras:** pie hábil, pierna mala ★1–5, filigranas ★1–5 (mediana de votos), altura, **PlayStyles** (26 tags tipo FC: finesse_shot, power_shot, tiki_taka, rapid, trickster, intercept, bruiser, aerial, relentless, far_reach…): se muestran con ≥40% de raters, "PlayStyle+" con ≥70% y ≥5 raters, máx 3 en la carta.
- **Niveles:** bronce <65, plata 65–74, oro ≥75, especial ≥85 o MVP del último partido. **Provisional (gris)** hasta 3 raters distintos.

## 6. Fórmula de rating (por jugador y sub-atributo; todo configurable)
1. Voto 1–10 → `s = 30 + 6.5·x`. Modo rápido: voto a stat de cara se expande a sus subs. Un voto vigente por rater/objetivo/atributo, re-votable cada 30 días; hay que haber compartido un partido.
2. Corrección de sesgo del rater (residuo medio vs media leave-one-out de los demás), solo con ≥10 votos.
3. Outliers: con n≥5 se descartan |s'−mediana| > 2.5·1.4826·MAD.
4. Peso = 0.5^(edad/90d) · confiabilidad (0.5–1.5) · rol (espectador 0.75); parejas con colusión ×0.5; tope 20% por rater.
5. Media ponderada + shrink bayesiano hacia la media del grupo (m=3, C=60).
6. **Forma** por partidos (ventana 72h, mediana ponderada ≥3 raters): `f = clamp(0.5·(M−6.5), −1, 1)` sobre los 8 atributos principales de la posición, doble en atributos "destacados"; decae con vida media 30d; |F|≤3.
7. `valor = clamp(round(base+F), 1, 99)`, límite ±2 por partido y ±4 cada 30 días.
- **Colusión:** A→B inflado >2σ y recíproco.
- **OpenSkill (Plackett-Luce, μ=25, σ=25/3):** se actualiza por partido; "Impacto" = μ−3σ como percentil 1–99. Usado para balancear equipos (snake draft por μ, desempate OVR, búsqueda de swaps).
- Votos **anónimos**: cada uno ve solo los suyos; el resto ve agregados y conteos.

## 7. Flujo de partido y conciliación de estadísticas
Estados: `scheduled → reporting → pending_finalize → finalized` (o `disputed → organizador resuelve → pending_finalize`; o `cancelled`).
- Stats: goles, asistencias, goles en contra, atajadas; derivados: valla invicta, MVP (mayor mediana de calificación; desempate G+A, luego OpenSkill).
- **Regla A:** (1) Primero el resultado: al menos un reporter por equipo, todos deben coincidir, si no → disputa. (2) Por jugador y stat: mediana de reportes (auto-reporte solitario se acepta). (3) Consistencia: goles del equipo + GEC del rival ≤ resultado; asistencias ≤ goles; sobre-reclamos se eliminan empezando por los menos respaldados; si sigue inconsistente → disputa. (4) Ventanas: reporte 48h, calificación 72h.
- Admin puede finalizar antes ("Cerrar partido ahora"), resolver disputas con valores autoritativos y, tras finalizar, asignar goles sin atribuir / corregir stats (auditado; nunca supera el resultado; otorga insignias nuevas, no revoca).
- **Pipeline de finalización:** conciliar → stats → OpenSkill → cartas → insignias → notificaciones → avance de llave.

## 8. Torneos
- **Formatos:** liga (ida o ida/vuelta, Berger, BYE si impar), eliminación simple (seeds 1v16, byes a mejores seeds, 3er puesto opcional), doble eliminación (llave de perdedores, final con reset opcional), grupos + eliminatoria (siembra serpiente, cruce A1vB2, mismos grupos en mitades opuestas), suizo (rondas = ceil(log2 n), sin revanchas, bye al peor sin bye previo, Buchholz/Sonneborn-Berger).
- **Siembra:** por OVR promedio (default), OpenSkill, manual o aleatoria.
- **Puntos** 3/1/0 (bye cuenta como victoria). **Desempates** configurables: puntos, dif. de gol, goles a favor/en contra, H2H, victorias, Buchholz, SB, sorteo.
- **Empate en KO:** penales (default, guardados aparte), alargue + penales, o manual.
- Avance automático al finalizar el partido real vinculado, en **una sola transacción**. Editar un resultado solo si nada aguas abajo empezó (se resetea y re-propaga).
- Entradas pueden ser **clubes** (escudo y colores en llave y tablas). Llave y tablas en tiempo real.

## 9. Engagement
- **Insignias (15):** primer partido, 10 y 50 partidos, primer gol, hat-trick, 25 goles, rey de asistencias (3+ en un partido, repetible), MVP, 5 MVP, valla invicta, 10 vallas, racha de 3 victorias, campeón de torneo, scout (10 votos), carta de oro.
- **Notificaciones (9 tipos), in-app + web push, configurables por tipo:** partido programado, reporte pendiente, calificación pendiente, partido finalizado, partido en disputa, torneo generado, partido de torneo listo, insignia ganada, carta actualizada.
- **Rankings** por grupo, **dashboard personal** (historial de OVR y atributos, forma, tendencias), **imagen compartible** de la carta, **PWA instalable** (Android/iPhone).

## 10. Plantillas y clubes (M7)
- **Clubes** por grupo: nombre, nombre corto, color primario/secundario, escudo (png/jpeg/webp ≤512KB, sin SVG), plantel con dorsales. Usables como equipo de partido y como entrada de torneo.
- **Plantillas:** tipo `dream` (equipo ideal del usuario) o `lineup` (alineación real, solo admins; "Aplicar al partido").
- **Formaciones** por tamaño: F5 2-2, 1-2-1, 2-1-1 · F6 2-2-1, 2-1-2, 3-2 · F7 2-3-1, 3-2-1, 2-2-2, 3-1-2 · F8 3-3-1, 3-2-2, 2-3-2 · F9 3-3-2, 3-4-1, 4-3-1 · F11 4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 4-1-2-1-2, 5-3-2.
- **OVR de equipo:** media de OVR por puesto + Σ max(0, ovr−media)/n.
- **Química (0–3 por jugador):** posición principal +2 / alternativa +1; +1 enlace si compartió ≥3 partidos en el mismo equipo con otro integrante; +1 club si ≥3 integrantes del mismo club. Máx 3n.
- Publicar, likes, imagen compartible; **Equipo de la semana** = plantilla más likeada publicada en los últimos 7 días.

## 11. Settings configurables (defaults)
- **Grupo:** tamaño de equipo 5; rating (escala 30/6.5, sesgo ≥10, MAD 2.5 con n≥5, vida media 90d, confiabilidad 0.5–1.5, espectador 0.75, colusión 2σ/×0.5, tope 20%, shrink m=3/C=60, min raters 3, forma, límites ±2/±4, OpenSkill μ/σ); scouting (re-voto 30d, exigir partido compartido, modo detallado on); ventanas 48h/72h; niveles 65/75/85 + MVP especial; PlayStyles 40%/70%/5/3; insignias on; espectadores califican on; química de plantillas.
- **Torneo:** siembra, puntos, desempates, empate KO, liga ida/vuelta, 3er puesto, reset en GF, grupos (cantidad 2, clasifican 2), rondas suizas.

## 12. Arquitectura técnica (decisiones)
- **Stack:** Next.js 16 (App Router, Server Components, Server Actions, `proxy.ts`), React 19, TypeScript 5.9 (no 7), Tailwind 4 + shadcn/ui, Supabase (Postgres, Auth, Storage, Realtime, pg_cron, pg_net, Vault), zod 4, Recharts 3, openskill, web-push + Serwist, next/og. Tests: Vitest, Testing Library, pgTAP, Playwright. Sin React Query ni next-intl (textos en `messages/es.ts`).
- **Motores puros** (sin I/O, testeados exhaustivamente): `lib/brackets`, `lib/rating`, `lib/reconcile`, `lib/squads`, `lib/badges`.
- **Seguridad:** RLS en todas las tablas + GRANTs explícitos + una policy por operación; tablas derivadas solo lectura; votos/reportes solo vía RPC SECURITY DEFINER (membresía, rol, participación, ventanas, no auto-voto, rangos); Server Actions: zod → auth → permiso → RPC; secret key solo en servidor; guard de open-redirect; cron con Bearer.
- **Infra:** dev en stack local Supabase (Docker); prod planificado: Supabase cloud (sa-east-1) + Vercel Hobby.
- **Calidad (2026-09-25):** lint 0, typecheck 0, 876 tests unitarios, 453 pgTAP, 89 integración DB, build OK, 17 e2e.

## 13. Pendiente
- M6: crear Supabase prod + `db push`, credenciales Google/Discord, Vercel + env vars, VAPID prod, secretos Vault, advisors, prueba en teléfono.
- Opcional: en `/yo`, partidos recientes con resultado y lado.

---
