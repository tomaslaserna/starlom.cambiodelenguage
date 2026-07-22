# Diagrama de flujos del proyecto Star_lim

Este documento resume el flujo tecnico y operativo observado en el repo actual.
La app principal vive en `apps/web` y usa Next.js App Router con APIs server-side,
Postgres/Supabase como base operativa y Supabase Auth/Storage como servicios
externos controlados desde el servidor.

## 1. Arquitectura general

```mermaid
flowchart TB
  U["Usuario interno"] --> B["Navegador"]
  B --> P["Next proxy<br/>rate limit, CSRF, refresh cookie"]
  P --> R["Next.js App Router<br/>pages y route handlers"]

  R --> Shell["ModulePage + ShellNavigation"]
  Shell --> UI["Pantallas ERP<br/>Inicio, pedidos, ventas, compras, caja, admin"]

  R --> Auth["Auth/session<br/>auth.ts + session-token.ts"]
  Auth --> SA["Supabase Auth<br/>password token"]
  Auth --> Cookie["Cookie httpOnly HMAC<br/>starlim_node_session"]

  R --> Perms["Autorizacion<br/>route-auth.ts + page-auth.ts"]
  Perms --> PermDb["profile_permissions<br/>role_permissions<br/>app_permissions"]

  R --> Libs["Librerias de dominio<br/>orders, quotes, purchases, collections, messages, pricing"]
  Libs --> DB["db.ts<br/>Pool pg + transaccion"]
  DB --> Ctx["set_config app.current_empresa_id"]
  Ctx --> PG["Supabase Postgres"]

  Libs --> Storage["storage.ts"]
  Storage --> SupaStorage["Supabase Storage<br/>recibos y adjuntos privados"]

  R --> Health["/api/health"]
  Health --> PG
```

## 2. Flujo de autenticacion y autorizacion

```mermaid
sequenceDiagram
  autonumber
  actor User as Usuario
  participant Login as /login + /api/auth/login
  participant Auth as auth.ts
  participant Supa as Supabase Auth
  participant PG as Postgres
  participant Cookie as Cookie HMAC
  participant Proxy as proxy.ts
  participant Page as Pagina/API privada
  participant Perms as route-auth.ts

  User->>Login: Envia usuario/email y password
  Login->>Login: Valida Content-Type, tamano y rate limit
  Login->>Auth: authenticateUser(identifier, password)
  Auth->>PG: Busca profiles + usuario_empresa + empresas activas
  Auth->>Supa: /auth/v1/token grant_type=password
  Supa-->>Auth: User id autenticado
  Auth-->>Login: AuthSession normalizada
  Login->>Cookie: encodeSession con HMAC y TTL 20 min
  Login-->>User: Redirect a / o JSON ok

  User->>Login: Solicita recuperar contrasena por correo
  Login->>Supa: resetPasswordForEmail con /reset-password
  Supa-->>User: Enlace de recuperacion de un solo uso
  User->>Supa: Valida el token y establece una clave nueva
  Supa-->>User: Actualiza la clave y vuelve a /login

  User->>Proxy: Requests siguientes con cookie
  Proxy->>Cookie: decodeSession
  Proxy->>Proxy: Rate limit API, CSRF en mutaciones, X-Request-Id
  Proxy->>Cookie: refreshSession si la cookie es valida
  Proxy->>Page: Continua request
  Page->>Auth: requireStaffSession o requireApiSession
  Page->>Perms: sessionAllows(permisos)
  Perms->>Perms: Chequea permisos legacy por rol
  Perms->>PG: Chequea profile_permissions/role_permissions
  Perms-->>Page: permitido o 403/redirect
```

El flujo requiere que Supabase Auth tenga autorizadas las URLs
`https://starlim.vercel.app/reset-password` y
`http://localhost:3000/reset-password`. La respuesta de solicitud es siempre
generica para no revelar si un correo pertenece a una cuenta.

## 3. Flujo de shell, menu e indicadores

```mermaid
flowchart LR
  Page["Pagina server component"] --> Req["requireStaffSession"]
  Req --> Module["ModulePage"]
  Module --> Authz["getNavigationAuthorization"]
  Authz --> Allowed["sessionAllows por cada permiso requerido"]
  Allowed --> Sections["authorizedNavigationSections"]
  Module --> Badges["getNavigationIndicators"]
  Badges --> BadgeSql["consultas a mensajes, tareas, sales, quotes, purchases"]
  Sections --> Nav["ShellNavigation"]
  Badges --> Nav
  Nav --> UserMenu["Menu lateral filtrado<br/>solo modulos permitidos"]
```

Los grupos principales del menu salen de `apps/web/src/lib/navigation.ts`:

- Inicio: escritorio, calendario, mensajes.
- Operaciones: pedidos, ventas, presupuestos, fiscal.
- Datos: precios, clientes, seguimiento, proveedores, stock.
- Compras: nueva compra, recompra MRP, registro.
- Administracion: empleados, metricas, rentabilidad, aprobaciones.
- Finanzas: balance, sueldos/dividendos, caja, cash flow, cuentas por pagar.
- Cobros y pagos: cobros, cuentas corrientes, pagos proveedores.

## 4. Flujo operativo comercial

```mermaid
flowchart TB
  subgraph Datos["Datos maestros"]
    Clients["clients"]
    Products["products"]
    Suppliers["suppliers"]
    PriceLists["listas_precio<br/>margenes_listas"]
  end

  subgraph Presupuestos["Presupuestos"]
    QuoteForm["/quotes<br/>crear presupuesto"]
    Quotes["quotes"]
    QuoteItems["quote_items"]
    Accept["acceptQuote"]
  end

  subgraph Pedidos["Pedidos y ventas"]
    OrderForm["/orders/new<br/>cargar pedido"]
    Sales["sales"]
    SaleItems["sale_items"]
    Delivered["entregado"]
    StockOut["stock_movements<br/>salida por entrega"]
  end

  subgraph Cobros["Cobros"]
    CollectList["/collections<br/>ventas entregadas con saldo"]
    Register["registerCollection<br/>pendiente_aprobacion"]
    Approve["approveCollection"]
    Payments["payments"]
    Account["current_account_movements"]
  end

  Clients --> QuoteForm
  Products --> QuoteForm
  PriceLists --> QuoteForm
  QuoteForm --> Quotes
  QuoteForm --> QuoteItems
  Quotes --> Accept
  QuoteItems --> Accept
  Accept --> Sales
  Accept --> SaleItems

  Clients --> OrderForm
  Products --> OrderForm
  PriceLists --> OrderForm
  OrderForm --> Sales
  OrderForm --> SaleItems
  Sales --> Delivered
  Delivered --> StockOut
  Delivered --> CollectList
  CollectList --> Register
  Register --> Approve
  Approve --> Payments
  Approve --> Account
```

El flujo visible de Pedidos permite `cargado -> entregado` en un solo paso. La entrega valida el stock físico disponible menos las reservas de otros pedidos confirmados, registra la salida y habilita el cobro dentro de la misma transacción. Los pedidos `confirmado` existentes siguen pudiendo entregarse o cancelarse por compatibilidad.

Estados principales:

- Pedido nuevo: crea `sales` y `sale_items` con `order_status = cargado`.
- Entrega: mueve de `cargado` o `confirmado` a `entregado`, descuenta stock con validacion y habilita cobro.
- Cobro registrado: queda en `pendiente_aprobacion`.
- Cobro aprobado: inserta `payments`, impacta `current_account_movements` y deja el saldo como `recibido` o `pendiente`.

## 5. Flujo operativo de compras, stock y pagos proveedor

```mermaid
flowchart TB
  Supplier["Proveedor activo"] --> PurchaseForm["/purchases<br/>nueva compra"]
  Product["Productos del proveedor"] --> PurchaseForm
  PurchaseForm --> Purchases["purchases"]
  PurchaseForm --> PurchaseItems["purchase_items"]

  Purchases --> Received["status = recibida"]
  Received --> Review["revision de paquete"]
  Review -->|marcar revisado| StockIn["stock_movements<br/>entrada_compra"]
  Review -->|reportar falla| PartialStock["entrada parcial + falla"]

  Received --> ReceiptUpload["subir recibo"]
  ReceiptUpload --> Storage["Supabase Storage<br/>recibos/recibo_empresa_*"]
  Storage --> SignedRoute["/api/storage/...<br/>URL firmada"]

  Purchases --> Pay["pago proveedor"]
  Pay -->|admin o jefe| DirectPay["executeSupplierPayment"]
  Pay -->|usuario sin permiso directo| ApprovalReq["app_solicitudes<br/>pago_proveedor"]
  DirectPay --> SupplierPayment["payments"]
  DirectPay --> SupplierAccount["current_account_movements<br/>proveedor"]
```

Reglas relevantes:

- La compra valida proveedor activo, productos activos y correspondencia producto-proveedor.
- El stock entra cuando la compra recibida se revisa, no al crear la compra.
- El pago a proveedor puede ir directo para roles altos o quedar como solicitud de aprobacion.
- Los recibos se suben con service role desde servidor y se sirven mediante ruta firmada.

## 6. Flujo de datos multiempresa

```mermaid
flowchart LR
  Session["AuthSession<br/>companyId"] --> Query["queryWithCompanyContext"]
  Query --> Tx["BEGIN"]
  Tx --> Config["set_config('app.current_empresa_id', companyId, true)"]
  Config --> SQL["SQL del modulo<br/>empresa_id = $1"]
  SQL --> Commit["COMMIT"]
  SQL --> Rollback["ROLLBACK si falla"]
  Commit --> Cache["Invalidacion de cache<br/>por tablas mutadas"]
```

El aislamiento de empresa se apoya en dos capas:

- La sesion trae `companyId` desde `usuario_empresa` y `empresas`.
- Las consultas pasan por `queryWithCompanyContext` o `withCompanyContext`, fijando `app.current_empresa_id` dentro de una transaccion y usando filtros `empresa_id`.

## 7. Flujo de APIs privadas

```mermaid
flowchart TB
  Request["Request /api/..."] --> Proxy["proxy.ts"]
  Proxy --> Limits["Rate limit por IP, metodo y ruta"]
  Proxy --> Csrf["CSRF same-origin para POST/PUT/PATCH/DELETE"]
  Csrf --> Handler["route.ts"]
  Handler --> Require["requireApiSession(permisos)"]
  Require --> Body["request-body.ts<br/>validacion y limites"]
  Body --> Domain["Funcion de dominio"]
  Domain --> DB["withCompanyContext/queryWithCompanyContext"]
  Domain --> Response["api-response.ts<br/>JSON/errores"]
```

Excepciones intencionales observadas:

- `/api/auth/login`: entrada publica con rate limit propio.
- `/api/auth/password-recovery`: solicita un enlace sin revelar si el correo existe.
- `/api/auth/me`: lee sesion actual.
- `/api/health`: health check de runtime y DB.
- `/api/auth/logout`: publica para cerrar cookie.

## 8. Flujo de soporte interno: mensajes, tareas y seguimiento

```mermaid
flowchart TB
  Home["/ Inicio"] --> Tasks["listTasks"]
  Home --> Messages["listMessageCenter"]
  Tasks --> Reminders["recordatorios"]
  Tasks --> Assigned["tareas_asignadas"]
  Messages --> MsgTable["mensajes"]
  Messages --> Attachments["mensaje_adjuntos"]
  Composer["Nuevo mensaje"] --> SignUpload["/api/messages/attachments/sign"]
  SignUpload --> Staged["mensaje_cargas<br/>token temporal"]
  SignUpload --> DirectStorage["carga directa firmada<br/>Supabase Storage privado"]
  Staged --> Attachments
  Attachments --> Download["/api/messages/:id/attachments/:id<br/>valida emisor o destinatario"]
  Download --> DirectStorage

  Calendar["/calendar"] --> CreateTask["createTask"]
  CreateTask -->|tarea propia| Reminders
  CreateTask -->|asignada a usuario| Assigned
  CreateTask --> Notify["mensaje tipo tarea_asignada"]
  Notify --> MsgTable

  FollowUp["/customers/follow-up"] --> History["sales entregadas por cliente"]
  History --> Buckets["al_dia, contactar, riesgo, perdido, sin_historial"]
```

## 9. Puntos de control del sistema

- Seguridad de entrada: proxy con rate limit, CSRF para mutaciones y cookie httpOnly firmada.
- Seguridad de negocio: permisos por rol legacy mas permisos DB por perfil/rol.
- Seguridad de datos: contexto multiempresa, filtros `empresa_id`, transacciones y locks en secuencias criticas.
- Integridad comercial: presupuestos se convierten atomica y trazablemente en pedidos.
- Integridad de stock: entrega de pedidos descuenta stock; revision de compras suma stock.
- Integridad financiera: cobros/pagos impactan `payments` y `current_account_movements`.
- Operacion diaria: inicio, mensajes, tareas e indicadores salen de las mismas tablas operativas.
- Adjuntos internos: la carga evita el limite de las funciones de Vercel mediante URLs firmadas, y la descarga exige pertenecer al mensaje antes de emitir una URL temporal.
