"use client";

import { Button, type ButtonProps } from "@/components/ui";

type ConfirmDeleteButtonProps = Omit<ButtonProps, "type" | "onClick"> & {
  confirmation: string;
};

export function ConfirmDeleteButton({ confirmation, children = "Borrar", ...props }: ConfirmDeleteButtonProps) {
  return (
    <Button
      {...props}
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
