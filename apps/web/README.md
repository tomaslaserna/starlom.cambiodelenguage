This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Facturación con ARCA

Las instancias comparten el ticket vigente de WSAA por ambiente, CUIT y certificado.
El ERP cifra el ticket con una clave derivada de `STARLIM_SESSION_SECRET` y coordina
la renovación desde Postgres. Aplicá la migración
`20261126183347_persist_arca_wsaa_tickets.sql` antes de desplegar el código.

La bandeja fiscal identifica la operación en los errores de conexión. Ante un
corte de `FECAESolicitar` consultá primero el comprobante en ARCA antes de volver
a autorizarlo, porque el servicio pudo procesar el envío antes de perderse la respuesta.

La emisión de ventas toma un bloqueo por emisor y punto de venta, relee la venta y reserva el número antes de enviarlo. Al reintentar consulta el número reservado en WSFE y verifica receptor, fecha e importe antes de guardar el CAE. Una respuesta incierta conserva la reserva. Para intentos anteriores a la migración sin número, un operador debe establecer el primer número verificable en `starlim_arca.reconciliation_windows`. Si la consulta encuentra una coincidencia, la emisión se detiene para revisión.
