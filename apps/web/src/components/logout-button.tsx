import { Button } from "@/components/ui";

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action="/api/auth/logout" method="post">
      <Button aria-label="Cerrar sesion" className={className} size="sm" type="submit" variant="secondary">
        Salir
      </Button>
    </form>
  );
}
