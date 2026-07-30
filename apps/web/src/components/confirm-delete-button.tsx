"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui";

type ConfirmDeleteButtonProps = Omit<ButtonProps, "type" | "onClick"> & {
  confirmation: string;
};

export function ConfirmDeleteButton({
  confirmation,
  children = "Borrar",
  isLoading,
  loadingLabel = "Borrando",
  ...props
}: ConfirmDeleteButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      {...props}
      isLoading={isLoading || pending}
      loadingLabel={loadingLabel}
      onClick={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
      type="submit"
      variant="danger"
    >
      {children}
    </Button>
  );
}
